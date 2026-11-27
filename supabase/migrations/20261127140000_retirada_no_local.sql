-- Retirar no local: o cliente pede pelo site e vai buscar no restaurante.
--
-- Não é uma `origem` nova. `origem` já significa "por onde o pedido entrou" (mesa, delivery,
-- balcão) e é usada na cozinha, nos relatórios, na RLS e no quadro; um pedido para retirar
-- continua sendo pedido do site, só não é levado por ninguém. Então entra
-- `pedidos.tipo_entrega` (entrega | retirada) sobre `origem = 'delivery'`, e tudo o que hoje
-- filtra por `origem = 'delivery'` continua pegando os dois.
--
-- Regras da retirada:
--   * sem endereço, sem bairro, sem taxa e sem entregador (garantido por constraint);
--   * sem pedido mínimo (o mínimo existe por causa da viagem do entregador);
--   * cupom de frete grátis não vale (não há frete);
--   * o status não passa por `saiu_entrega`: recebido → em_preparo → pronto → entregue;
--   * o restaurante aceita retirada mesmo com o delivery desligado (quem só faz balcão).

-- ---------------------------------------------------------------------------
-- Restaurante: liga a retirada e diz em quanto tempo fica pronto
-- ---------------------------------------------------------------------------

alter table public.restaurantes
  add column aceita_retirada boolean not null default false,
  add column tempo_estimado_retirada_min integer;

alter table public.restaurantes
  add constraint restaurantes_tempo_retirada_check
  check (tempo_estimado_retirada_min is null or tempo_estimado_retirada_min between 1 and 240);

grant select (aceita_retirada, tempo_estimado_retirada_min) on public.restaurantes to anon, authenticated;
grant update (aceita_retirada, tempo_estimado_retirada_min) on public.restaurantes to authenticated;

create or replace view public.restaurantes_publicos
with (security_invoker = true) as
select id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco, fuso_horario,
  horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, taxa_entrega_modo, taxa_entrega_fixa,
  capa_url, descricao, instagram, facebook, aceita_retirada, tempo_estimado_retirada_min
from public.restaurantes
where ativo and excluido_em is null;

-- ---------------------------------------------------------------------------
-- Pedido: entrega ou retirada
-- ---------------------------------------------------------------------------

alter table public.pedidos
  add column tipo_entrega text not null default 'entrega'
  check (tipo_entrega in ('entrega', 'retirada'));

-- O banco é quem garante que retirada não tem endereço, taxa nem entregador: assim nenhuma
-- função nova pode criar um pedido de retirada cobrando frete.
alter table public.pedidos
  add constraint pedidos_retirada_sem_entrega check (
    tipo_entrega = 'entrega'
    or (origem = 'delivery' and taxa_entrega = 0 and bairro_id is null and entregador_id is null)
  );

-- "Delivery precisa de bairro" passa a valer só para quem recebe em casa: quem vem buscar não
-- tem endereço nenhum. Nome e telefone continuam obrigatórios nos dois (é por eles que o
-- restaurante chama quem chegou).
alter table public.pedidos drop constraint pedidos_delivery_cliente_bairro;
alter table public.pedidos add constraint pedidos_delivery_cliente_bairro check (
  origem <> 'delivery'
  or (cliente_nome is not null and cliente_telefone is not null
      and (tipo_entrega = 'retirada'
           or bairro_id is not null or coalesce(btrim(endereco ->> 'bairro'), '') <> ''))
);

-- ---------------------------------------------------------------------------
-- O site está recebendo pedido? E de que jeito?
-- ---------------------------------------------------------------------------

-- Agora responde também `entrega` e `retirada`: o checkout precisa saber quais opções oferecer,
-- e "aberto" passa a valer se pelo menos um dos dois jeitos estiver ligado.
create or replace function public.consultar_disponibilidade_delivery(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_restaurante public.restaurantes;
  v_fechado jsonb := jsonb_build_object('entrega', false, 'retirada', false);
begin
  select * into v_restaurante from public.restaurantes
  where id = p_restaurante_id and ativo and excluido_em is null;

  if v_restaurante.id is null or rest_privado.restaurante_suspenso(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'restaurante_indisponivel') || v_fechado;
  end if;
  if not v_restaurante.aceita_delivery and not v_restaurante.aceita_retirada then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_delivery') || v_fechado;
  end if;
  if not rest_privado.esta_no_horario(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'fora_do_horario') || v_fechado;
  end if;
  if not exists (
    select 1 from public.caixa_sessoes where restaurante_id = p_restaurante_id and fechada_em is null
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'caixa_fechado') || v_fechado;
  end if;
  return jsonb_build_object(
    'aberto', true, 'motivo', null,
    'entrega', v_restaurante.aceita_delivery,
    'retirada', v_restaurante.aceita_retirada
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Criar o pedido
-- ---------------------------------------------------------------------------

drop function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer, text);

create function public.criar_pedido_delivery(
  p_restaurante_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_bairro_id uuid,
  p_endereco jsonb,
  p_forma_pagamento text,
  p_itens jsonb,
  p_troco_para integer default null,
  p_observacao text default null,
  p_chave uuid default null,
  p_total_esperado integer default null,
  p_cupom text default null,
  p_tipo_entrega text default 'entrega'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disponibilidade jsonb;
  v_pedido_minimo integer;
  v_taxa integer;
  v_pedido_id uuid;
  v_numero integer;
  v_subtotal integer;
  v_total integer;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade integer;
  v_telefone text := regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g');
  v_nome_produto text;
  v_modo text;
  v_bairro_id uuid;
  v_cupom public.cupons;
  v_retirada boolean := coalesce(p_tipo_entrega, 'entrega') = 'retirada';
  v_endereco jsonb;
begin
  if coalesce(p_tipo_entrega, 'entrega') not in ('entrega', 'retirada') then
    raise exception 'Tipo de entrega inválido.' using errcode = 'P0001';
  end if;

  -- Mesmo envio repetido (resposta perdida na rede, toque duplo): devolve o pedido já criado.
  if p_chave is not null then
    select jsonb_build_object('id', id, 'numero', numero, 'total', total) into v_item
    from public.pedidos where restaurante_id = p_restaurante_id and chave_idempotencia = p_chave;
    if v_item is not null then
      return v_item;
    end if;
  end if;

  -- Restaurante aberto, e aberto para este jeito de receber.
  v_disponibilidade := public.consultar_disponibilidade_delivery(p_restaurante_id);
  if not (v_disponibilidade ->> 'aberto')::boolean then
    raise exception 'Restaurante não está recebendo pedidos agora (%).', v_disponibilidade ->> 'motivo'
      using errcode = 'P0001';
  end if;
  if v_retirada and not (v_disponibilidade ->> 'retirada')::boolean then
    raise exception 'Este restaurante não está aceitando retirada no local agora.' using errcode = 'P0001';
  end if;
  if not v_retirada and not (v_disponibilidade ->> 'entrega')::boolean then
    raise exception 'Este restaurante não está entregando agora.' using errcode = 'P0001';
  end if;

  -- Cliente: nome e telefone valem para os dois (é por eles que o restaurante chama quem veio buscar).
  if length(btrim(coalesce(p_cliente_nome, ''))) not between 2 and 120 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if length(v_telefone) not between 10 and 13 then
    raise exception 'Telefone inválido.' using errcode = 'P0001';
  end if;
  if p_forma_pagamento is null or p_forma_pagamento not in ('dinheiro', 'pix', 'credito', 'debito') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  if length(p_observacao) > 500 then
    raise exception 'Observação muito longa.' using errcode = 'P0001';
  end if;

  if v_retirada then
    -- Quem vem buscar não tem endereço de entrega, nem bairro, nem taxa.
    v_endereco := null;
    v_bairro_id := null;
    v_taxa := 0;
  else
    if jsonb_typeof(p_endereco) <> 'object'
       or length(btrim(coalesce(p_endereco ->> 'rua', ''))) = 0
       or length(btrim(coalesce(p_endereco ->> 'numero', ''))) = 0
       or length(p_endereco::text) > 1000 then
      raise exception 'Endereço inválido.' using errcode = 'P0001';
    end if;
    v_endereco := p_endereco;

    -- Taxa: fixa (o cliente digita o bairro, com ajuda do CEP) ou pela lista de bairros atendidos.
    select taxa_entrega_modo, taxa_entrega_fixa into v_modo, v_taxa
    from public.restaurantes where id = p_restaurante_id;
    if v_modo = 'fixa' then
      if length(btrim(coalesce(p_endereco ->> 'bairro', ''))) = 0 then
        raise exception 'Informe o bairro.' using errcode = 'P0001';
      end if;
      v_bairro_id := null;
    else
      select taxa into v_taxa
      from public.bairros_entrega
      where id = p_bairro_id and restaurante_id = p_restaurante_id and ativo;
      if v_taxa is null then
        raise exception 'Bairro não atendido.' using errcode = 'P0001';
      end if;
      v_bairro_id := p_bairro_id;
    end if;
  end if;

  -- Itens.
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido não tem itens.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'Itens demais no pedido.' using errcode = 'P0001';
  end if;

  -- Cupom: ativo, na validade, com uso sobrando e (se for o caso) uma vez por telefone.
  -- A mensagem termina com "(cupom)": o site tira o cupom do carrinho e mostra o aviso.
  if nullif(btrim(coalesce(p_cupom, '')), '') is not null then
    select * into v_cupom
    from public.cupons
    where restaurante_id = p_restaurante_id and codigo = upper(btrim(p_cupom)) and ativo
      and (inicio is null or inicio <= now()) and (fim is null or fim > now())
    for update;
    if v_cupom.id is null then
      raise exception 'Cupom inválido ou vencido. (cupom)' using errcode = 'P0001';
    end if;
    -- Frete grátis em pedido para retirar não desconta nada: melhor recusar do que cobrar o
    -- mesmo valor e deixar a pessoa achando que o cupom entrou.
    if v_retirada and v_cupom.tipo = 'frete' then
      raise exception 'Este cupom é de frete grátis e vale só para entrega. (cupom)' using errcode = 'P0001';
    end if;
    if v_cupom.limite_usos is not null and (
      select count(*) from public.pedidos where cupom_id = v_cupom.id and status <> 'cancelado'
    ) >= v_cupom.limite_usos then
      raise exception 'Este cupom já esgotou. (cupom)' using errcode = 'P0001';
    end if;
    if v_cupom.um_por_cliente and exists (
      select 1 from public.pedidos
      where cupom_id = v_cupom.id and cliente_telefone = v_telefone and status <> 'cancelado'
    ) then
      raise exception 'Este cupom já foi usado neste telefone. (cupom)' using errcode = 'P0001';
    end if;
    perform set_config('rest.cupom', v_cupom.id::text, true);
  end if;

  insert into public.pedidos (
    restaurante_id, origem, tipo_entrega, cliente_nome, cliente_telefone, endereco, bairro_id,
    taxa_entrega, forma_pagamento_prevista, troco_para, observacao, chave_idempotencia,
    cupom_id, cupom_codigo, cupom_tipo, cupom_valor
  ) values (
    p_restaurante_id, 'delivery', coalesce(p_tipo_entrega, 'entrega'), btrim(p_cliente_nome), v_telefone, v_endereco, v_bairro_id,
    v_taxa, p_forma_pagamento, case when p_forma_pagamento = 'dinheiro' then p_troco_para end,
    nullif(btrim(p_observacao), ''), p_chave,
    v_cupom.id, v_cupom.codigo, v_cupom.tipo, v_cupom.valor
  )
  returning id, numero into v_pedido_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    begin
      v_produto_id := (v_item ->> 'produto_id')::uuid;
      v_quantidade := (v_item ->> 'quantidade')::integer;
    exception when others then
      raise exception 'Item inválido.' using errcode = 'P0001';
    end;

    if v_quantidade is null or v_quantidade not between 1 and 99 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    if length(v_item ->> 'observacao') > 300 then
      raise exception 'Observação do item muito longa.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.produtos p
      join public.categorias c on c.id = p.categoria_id
      where p.id = v_produto_id
        and p.restaurante_id = p_restaurante_id
        and p.disponivel and p.disponivel_delivery and c.ativa
    ) then
      select nome into v_nome_produto from public.produtos where id = v_produto_id and restaurante_id = p_restaurante_id;
      raise exception 'Acabou de esgotar: %. Tire do carrinho e envie de novo. (indisponivel)',
        coalesce(v_nome_produto, 'um dos itens') using errcode = 'P0001';
    end if;

    -- Nome, preço e opções são preenchidos pelo trigger a partir do cadastro.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais)
    values (p_restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, nullif(btrim(v_item ->> 'observacao'), ''),
            coalesce(v_item -> 'adicionais', '[]'::jsonb));
  end loop;

  select subtotal, total into v_subtotal, v_total from public.pedidos where id = v_pedido_id;

  -- Pedido mínimo é por causa da viagem do entregador: quem vem buscar leva o que quiser.
  if not v_retirada then
    select pedido_minimo into v_pedido_minimo from public.restaurantes where id = p_restaurante_id;
    if v_subtotal < v_pedido_minimo then
      raise exception 'Pedido mínimo não atingido.' using errcode = 'P0001';
    end if;
  end if;
  if v_cupom.id is not null and v_subtotal < v_cupom.pedido_minimo then
    raise exception 'Este cupom vale para pedidos a partir de %. (cupom)',
      rest_privado.texto_reais(v_cupom.pedido_minimo) using errcode = 'P0001';
  end if;
  -- O cliente viu um total; se o preço mudou no meio do caminho, não cobra diferente sem avisar.
  if p_total_esperado is not null and p_total_esperado <> v_total then
    raise exception 'Os preços foram atualizados: o total agora é %. Confira o carrinho e envie de novo. (precos_mudaram)',
      rest_privado.texto_reais(v_total) using errcode = 'P0001';
  end if;
  if p_forma_pagamento = 'dinheiro' and p_troco_para is not null and p_troco_para < v_total then
    raise exception 'O troco deve ser para um valor maior que o total.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'total', v_total);
end;
$$;

revoke execute on function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer, text, text) from public;
grant execute on function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- O que não muda depois de criado
-- ---------------------------------------------------------------------------

-- `tipo_entrega` entra na lista dos campos travados: um pedido não vira retirada (nem deixa de
-- ser) depois de enviado, nem pela edição do caixa — o cliente combinou de buscar.
create or replace function rest_privado.pedidos_campos_fixos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rest_privado.edicao_autorizada(new.id) and (
     new.taxa_entrega is distinct from old.taxa_entrega
     or new.bairro_id is distinct from old.bairro_id
     or new.endereco is distinct from old.endereco
     or new.cliente_nome is distinct from old.cliente_nome
     or new.cliente_telefone is distinct from old.cliente_telefone
     or new.forma_pagamento_prevista is distinct from old.forma_pagamento_prevista
     or new.troco_para is distinct from old.troco_para
     or new.chave_idempotencia is distinct from old.chave_idempotencia
     or new.observacao is distinct from old.observacao
     -- cliente_id só pode sumir (conta do cliente excluída: a FK faz "set null").
     or (new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null)) then
    raise exception 'Os dados do pedido não podem ser alterados.' using errcode = 'P0001';
  end if;
  -- Nem a edição troca a chave do envio, o cliente da conta ou o jeito de receber.
  if new.chave_idempotencia is distinct from old.chave_idempotencia
     or new.tipo_entrega is distinct from old.tipo_entrega
     or (new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null) then
    raise exception 'Os dados do pedido não podem ser alterados.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if new.origem = 'delivery'
       and (select auth.uid()) is not null
       and not (old.status = 'em_preparo' and new.status = 'pronto')
       and not (old.status = 'recebido' and new.status = 'cancelado' and rest_privado.cancelamento_do_cliente(new.id))
       and not rest_privado.tem_permissao(new.restaurante_id, array['delivery']) then
      raise exception 'Sem permissão para mudar o andamento do delivery.' using errcode = 'P0001';
    end if;

    if new.status = 'cancelado' and exists (
      select 1 from public.pagamentos where pedido_id = new.id and estornado_em is null
    ) then
      raise exception 'Estorne o pagamento antes de cancelar o pedido.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Andamento: a retirada não sai para entrega
-- ---------------------------------------------------------------------------

create or replace function rest_privado.pedidos_transicao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome jsonb := '{"recebido": "recebido", "em_preparo": "em preparo", "pronto": "pronto", "saiu_entrega": "saiu para entrega", "entregue": "entregue"}';
begin
  if old.origem <> 'delivery' or new.status = old.status or new.status = 'cancelado' or old.status = 'cancelado' then
    return new; -- cancelamento tem as regras próprias em t10_antes_atualizar
  end if;
  if old.status = 'entregue' then
    raise exception 'Pedido já entregue.' using errcode = 'P0001';
  end if;
  -- Ninguém sai para entregar um pedido que o cliente vem buscar.
  if new.tipo_entrega = 'retirada' and new.status = 'saiu_entrega' then
    raise exception 'Este pedido é para retirar no local.' using errcode = 'P0001';
  end if;
  if old.status = 'recebido' and new.status <> 'em_preparo' then
    raise exception 'Aceite o pedido antes de marcá-lo como %.', v_nome ->> new.status using errcode = 'P0001';
  end if;
  if rest_privado.ordem_status_delivery(new.status) < rest_privado.ordem_status_delivery(old.status) then
    raise exception 'O pedido não pode voltar de "%" para "%".', v_nome ->> old.status, v_nome ->> new.status
      using errcode = 'P0001';
  end if;
  if old.status = 'recebido' then
    new.aceito_em := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entregador: só em pedido que alguém leva
-- ---------------------------------------------------------------------------

create or replace function rest_privado.pedidos_entregador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.entregadores;
begin
  if tg_op = 'INSERT' then
    new.entregador_id := null;
    new.valor_entregador := 0;
    return new;
  end if;

  if new.entregador_id is distinct from old.entregador_id then
    if new.origem <> 'delivery' then
      raise exception 'Só pedido de delivery tem entregador.' using errcode = 'P0001';
    end if;
    if new.tipo_entrega = 'retirada' then
      raise exception 'Este pedido é para retirar no local: não tem entregador.' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null and not rest_privado.tem_permissao(new.restaurante_id, array['delivery']) then
      raise exception 'Sem permissão para escolher o entregador.' using errcode = 'P0001';
    end if;
    if old.status in ('entregue', 'cancelado') then
      raise exception 'Pedido já finalizado.' using errcode = 'P0001';
    end if;
  end if;

  if new.entregador_id is null then
    new.valor_entregador := 0;
  elsif new.entregador_id is distinct from old.entregador_id or new.taxa_entrega is distinct from old.taxa_entrega then
    select * into v_e from public.entregadores where id = new.entregador_id and restaurante_id = new.restaurante_id;
    if v_e.id is null or (new.entregador_id is distinct from old.entregador_id and not v_e.ativo) then
      raise exception 'Entregador inválido.' using errcode = 'P0001';
    end if;
    new.valor_entregador := case when v_e.recebe_taxa then new.taxa_entrega else v_e.valor_por_entrega end;
  else
    new.valor_entregador := old.valor_entregador;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acompanhamento do cliente
-- ---------------------------------------------------------------------------

-- O cliente precisa saber que o pedido dele é de retirada (a tela fala outra língua) e em quanto
-- tempo fica pronto. O endereço do restaurante já é público, pelo cardápio.
create or replace function public.consultar_pedido_publico(p_pedido_id uuid)
returns jsonb
language sql
stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'restaurante_id', p.restaurante_id,
    'numero', p.numero,
    'status', p.status,
    'tipo_entrega', p.tipo_entrega,
    'criado_em', p.criado_em,
    'subtotal', p.subtotal,
    'taxa_entrega', p.taxa_entrega,
    'desconto', p.desconto,
    'cupom_codigo', p.cupom_codigo,
    'total', p.total,
    'forma_pagamento_prevista', p.forma_pagamento_prevista,
    'troco_para', p.troco_para,
    'motivo_cancelamento', case when p.status = 'cancelado' then p.motivo_cancelamento end,
    'cancelado_pelo_cliente', p.cancelado_pelo_cliente,
    'tempo_estimado_entrega_min', case
      when p.tipo_entrega = 'retirada' then r.tempo_estimado_retirada_min
      else r.tempo_estimado_entrega_min
    end,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome_produto', i.nome_produto,
        'quantidade', i.quantidade,
        'preco_unitario', i.preco_unitario,
        'preco_adicionais', i.preco_adicionais,
        'adicionais', (
          select coalesce(jsonb_agg(jsonb_build_object('grupo', a ->> 'grupo', 'nome', a ->> 'nome', 'preco', (a ->> 'preco')::integer)), '[]'::jsonb)
          from jsonb_array_elements(i.adicionais) a
        ),
        'total', i.total,
        'observacao', i.observacao
      ) order by i.criado_em)
      from public.itens_pedido i
      where i.pedido_id = p.id and i.cancelado_em is null
    ), '[]'::jsonb)
  )
  from public.pedidos p
  join public.restaurantes r on r.id = p.restaurante_id
  where p.id = p_pedido_id
    and p.origem = 'delivery'
    and r.ativo and r.excluido_em is null;
$$;
