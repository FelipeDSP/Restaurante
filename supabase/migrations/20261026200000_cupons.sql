-- Cupom de desconto no delivery (pedido do chefe). O dono cria; o cliente digita no checkout.
-- O banco valida tudo de novo ao criar o pedido e guarda uma cópia do cupom no pedido (como o
-- preço do item): mudar ou desativar o cupom depois não mexe nos pedidos feitos.

create table public.cupons (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  codigo text not null check (codigo ~ '^[A-Z0-9_-]{3,20}$'),
  -- percentual: valor = % (1 a 100) sobre os itens; valor: centavos fora dos itens; frete: entrega grátis.
  tipo text not null check (tipo in ('percentual', 'valor', 'frete')),
  valor integer not null default 0,
  pedido_minimo integer not null default 0 check (pedido_minimo between 0 and 10000000),
  inicio timestamptz,
  fim timestamptz,
  limite_usos integer check (limite_usos is null or limite_usos > 0),
  um_por_cliente boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, codigo),
  unique (restaurante_id, id),
  check (
    (tipo = 'percentual' and valor between 1 and 100)
    or (tipo = 'valor' and valor between 1 and 10000000)
    or (tipo = 'frete' and valor = 0)
  ),
  check (fim is null or inicio is null or fim > inicio)
);

alter table public.cupons enable row level security;
revoke all on public.cupons from anon, authenticated;
grant select on public.cupons to authenticated;
grant insert (restaurante_id, codigo, tipo, valor, pedido_minimo, inicio, fim, limite_usos, um_por_cliente, ativo) on public.cupons to authenticated;
grant update (pedido_minimo, inicio, fim, limite_usos, um_por_cliente, ativo) on public.cupons to authenticated;

create policy cupons_dono_le on public.cupons
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
create policy cupons_dono_cria on public.cupons
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy cupons_dono_altera on public.cupons
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

alter table public.pedidos
  add column cupom_id uuid,
  add column cupom_codigo text,
  add column cupom_tipo text,
  add column cupom_valor integer,
  add column desconto integer not null default 0 check (desconto >= 0),
  add foreign key (restaurante_id, cupom_id) references public.cupons (restaurante_id, id);

create index pedidos_restaurante_cupom on public.pedidos (restaurante_id, cupom_id) where cupom_id is not null;

-- Pedido novo: o cupom só entra quando a criação do delivery validou (marca na transação).
create or replace function rest_privado.pedidos_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
  v_status_comanda text;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  update public.caixa_sessoes
  set ultimo_numero_pedido = ultimo_numero_pedido + 1
  where id = new.caixa_sessao_id
  returning ultimo_numero_pedido into v_numero;
  new.numero := v_numero;

  if new.origem = 'mesa' then
    select status into v_status_comanda
    from public.comandas
    where id = new.comanda_id and restaurante_id = new.restaurante_id
    for update;

    if v_status_comanda is null or v_status_comanda not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
    -- Novo lançamento depois de pedir a conta reabre a comanda.
    if v_status_comanda = 'conta_pedida' then
      update public.comandas set status = 'aberta' where id = new.comanda_id;
    end if;
  end if;

  if new.origem <> 'delivery' then
    new.taxa_entrega := 0;
  end if;

  if new.origem <> 'delivery' or new.cupom_id is null
     or coalesce(current_setting('rest.cupom', true), '') <> new.cupom_id::text then
    new.cupom_id := null;
    new.cupom_codigo := null;
    new.cupom_tipo := null;
    new.cupom_valor := null;
  end if;

  new.status := 'recebido';
  new.subtotal := 0;
  new.desconto := case when new.cupom_tipo = 'frete' then new.taxa_entrega else 0 end;
  new.total := new.taxa_entrega - new.desconto;
  new.criado_por := rest_privado.membro_atual(new.restaurante_id);
  new.criado_em := now();
  new.cancelado_em := null;
  new.cancelado_por := null;
  new.motivo_cancelamento := null;
  return new;
end;
$$;

create or replace function rest_privado.pedidos_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal integer;
begin
  new.numero := old.numero;
  new.origem := old.origem;
  new.comanda_id := old.comanda_id;
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  -- O cupom do pedido não muda (nem pela edição).
  new.cupom_id := old.cupom_id;
  new.cupom_codigo := old.cupom_codigo;
  new.cupom_tipo := old.cupom_tipo;
  new.cupom_valor := old.cupom_valor;

  if old.status = 'cancelado' then
    if new.status <> 'cancelado' then
      raise exception 'Pedido cancelado não pode ser reaberto.' using errcode = 'P0001';
    end if;
    new.cancelado_em := old.cancelado_em;
    new.cancelado_por := old.cancelado_por;
    new.motivo_cancelamento := old.motivo_cancelamento;
  elsif new.status = 'cancelado' then
    if coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_em := now();
    new.cancelado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.cancelado_em := null;
    new.cancelado_por := null;
    new.motivo_cancelamento := null;
  end if;

  if new.origem <> 'delivery' then
    new.taxa_entrega := 0;
  end if;

  select coalesce(sum(total), 0) into v_subtotal
  from public.itens_pedido
  where pedido_id = new.id and cancelado_em is null;

  new.subtotal := v_subtotal;
  -- Desconto do cupom sobre o valor atual (a edição do pedido recalcula).
  new.desconto := case new.cupom_tipo
    when 'percentual' then round(v_subtotal * new.cupom_valor / 100.0)::integer
    when 'valor' then least(new.cupom_valor, v_subtotal)
    when 'frete' then new.taxa_entrega
    else 0
  end;
  new.total := v_subtotal + new.taxa_entrega - new.desconto;
  return new;
end;
$$;

-- Prévia no checkout: o cliente vê o desconto antes de enviar (o banco confere de novo no envio).
create or replace function public.validar_cupom(p_restaurante_id uuid, p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cupom public.cupons;
begin
  select c.* into v_cupom
  from public.cupons c
  join public.restaurantes r on r.id = c.restaurante_id and r.ativo and r.excluido_em is null
  where c.restaurante_id = p_restaurante_id
    and c.codigo = upper(btrim(coalesce(p_codigo, '')))
    and c.ativo
    and (c.inicio is null or c.inicio <= now())
    and (c.fim is null or c.fim > now());
  if v_cupom.id is null then
    raise exception 'Cupom inválido ou vencido.' using errcode = 'P0001';
  end if;
  if v_cupom.limite_usos is not null and (
    select count(*) from public.pedidos where cupom_id = v_cupom.id and status <> 'cancelado'
  ) >= v_cupom.limite_usos then
    raise exception 'Este cupom já esgotou.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('codigo', v_cupom.codigo, 'tipo', v_cupom.tipo, 'valor', v_cupom.valor, 'pedido_minimo', v_cupom.pedido_minimo);
end;
$$;

revoke execute on function public.validar_cupom(uuid, text) from public;
grant execute on function public.validar_cupom(uuid, text) to anon, authenticated;

-- Criar pedido: agora com o cupom (parâmetro novo no fim; a versão antiga sai).
drop function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer);
CREATE OR REPLACE FUNCTION public.criar_pedido_delivery(p_restaurante_id uuid, p_cliente_nome text, p_cliente_telefone text, p_bairro_id uuid, p_endereco jsonb, p_forma_pagamento text, p_itens jsonb, p_troco_para integer DEFAULT NULL::integer, p_observacao text DEFAULT NULL::text, p_chave uuid DEFAULT NULL::uuid, p_total_esperado integer DEFAULT NULL::integer, p_cupom text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
begin
  -- Mesmo envio repetido (resposta perdida na rede, toque duplo): devolve o pedido já criado.
  if p_chave is not null then
    select jsonb_build_object('id', id, 'numero', numero, 'total', total) into v_item
    from public.pedidos where restaurante_id = p_restaurante_id and chave_idempotencia = p_chave;
    if v_item is not null then
      return v_item;
    end if;
  end if;

  -- Restaurante aberto para delivery.
  v_disponibilidade := public.consultar_disponibilidade_delivery(p_restaurante_id);
  if not (v_disponibilidade ->> 'aberto')::boolean then
    raise exception 'Restaurante não está recebendo pedidos agora (%).', v_disponibilidade ->> 'motivo'
      using errcode = 'P0001';
  end if;

  -- Cliente e endereço.
  if length(btrim(coalesce(p_cliente_nome, ''))) not between 2 and 120 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if length(v_telefone) not between 10 and 13 then
    raise exception 'Telefone inválido.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_endereco) <> 'object'
     or length(btrim(coalesce(p_endereco ->> 'rua', ''))) = 0
     or length(btrim(coalesce(p_endereco ->> 'numero', ''))) = 0
     or length(p_endereco::text) > 1000 then
    raise exception 'Endereço inválido.' using errcode = 'P0001';
  end if;
  if p_forma_pagamento is null or p_forma_pagamento not in ('dinheiro', 'pix', 'credito', 'debito') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  if length(p_observacao) > 500 then
    raise exception 'Observação muito longa.' using errcode = 'P0001';
  end if;

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
    restaurante_id, origem, cliente_nome, cliente_telefone, endereco, bairro_id,
    taxa_entrega, forma_pagamento_prevista, troco_para, observacao, chave_idempotencia,
    cupom_id, cupom_codigo, cupom_tipo, cupom_valor
  ) values (
    p_restaurante_id, 'delivery', btrim(p_cliente_nome), v_telefone, p_endereco, v_bairro_id,
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

  select pedido_minimo into v_pedido_minimo from public.restaurantes where id = p_restaurante_id;
  if v_subtotal < v_pedido_minimo then
    raise exception 'Pedido mínimo não atingido.' using errcode = 'P0001';
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
$function$;

revoke execute on function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer, text) from public;
grant execute on function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer, text) to anon, authenticated;

-- Acompanhamento público com o desconto.
CREATE OR REPLACE FUNCTION public.consultar_pedido_publico(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', p.id,
    'restaurante_id', p.restaurante_id,
    'numero', p.numero,
    'status', p.status,
    'criado_em', p.criado_em,
    'subtotal', p.subtotal,
    'taxa_entrega', p.taxa_entrega,
    'desconto', p.desconto,
    'cupom_codigo', p.cupom_codigo,
    'total', p.total,
    'forma_pagamento_prevista', p.forma_pagamento_prevista,
    'troco_para', p.troco_para,
    'motivo_cancelamento', case when p.status = 'cancelado' then p.motivo_cancelamento end,
    'tempo_estimado_entrega_min', r.tempo_estimado_entrega_min,
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
$function$;

-- Resumo do caixa e relatórios: vendido já com o desconto; descontos à parte.
CREATE OR REPLACE FUNCTION public.resumo_caixa_sessao(p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  sessao as (
    select * from public.caixa_sessoes where id = p_sessao_id
  ),
  pagamentos as (
    select p.*, case when p.comanda_id is not null then 'mesa' else pe.origem end as origem
    from public.pagamentos p
    left join public.pedidos pe on pe.id = p.pedido_id
    where p.caixa_sessao_id = p_sessao_id
  ),
  recebidos as (
    select * from pagamentos where estornado_em is null
  ),
  pedidos as (
    select * from public.pedidos where caixa_sessao_id = p_sessao_id
  ),
  itens as (
    select i.*, pe.status as status_pedido
    from public.itens_pedido i
    join pedidos pe on pe.id = i.pedido_id
  ),
  vendidos as (
    select * from itens where cancelado_em is null and status_pedido <> 'cancelado'
  ),
  movimentos as (
    select * from public.movimentos_caixa where caixa_sessao_id = p_sessao_id
  )
  select case when not exists (select 1 from sessao) then null else jsonb_build_object(
    'sessao', (
      select jsonb_build_object(
        'id', s.id,
        'aberta_em', s.aberta_em,
        'fechada_em', s.fechada_em,
        'valor_inicial', s.valor_inicial,
        'valor_contado', s.valor_contado,
        'observacao', s.observacao,
        'aberta_por', (select nome from public.membros where id = s.aberta_por),
        'fechada_por', (select nome from public.membros where id = s.fechada_por)
      )
      from sessao s
    ),
    'total_recebido', coalesce((select sum(valor) from recebidos), 0),
    'dinheiro_recebido', coalesce((select sum(valor) from recebidos where forma = 'dinheiro'), 0),
    'sangrias', coalesce((select sum(valor) from movimentos where tipo = 'sangria'), 0),
    'suprimentos', coalesce((select sum(valor) from movimentos where tipo = 'suprimento'), 0),
    'movimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', mv.tipo, 'valor', mv.valor, 'motivo', mv.motivo, 'em', mv.criado_em, 'por', m.nome
      ) order by mv.criado_em)
      from movimentos mv left join public.membros m on m.id = mv.registrado_por
    ), '[]'::jsonb),
    'total_vendido',
      coalesce((select sum(total) from vendidos), 0)
      + coalesce((select sum(taxa_entrega) from pedidos where status <> 'cancelado'), 0)
      - coalesce((select sum(desconto) from pedidos where status <> 'cancelado'), 0),
    'descontos', coalesce((select sum(desconto) from pedidos where status <> 'cancelado'), 0),
    -- Taxa de serviço e couvert das mesas fechadas na sessão (fora do "vendido": o serviço é do garçom).
    'servico', coalesce((select sum(servico) from public.comandas where caixa_sessao_id = p_sessao_id and status = 'fechada'), 0),
    'couvert', coalesce((select sum(couvert) from public.comandas where caixa_sessao_id = p_sessao_id and status = 'fechada'), 0),
    'quantidade_itens', coalesce((select sum(quantidade) from vendidos), 0),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'valor', valor, 'quantidade', quantidade) order by valor desc)
      from (select forma, sum(valor) as valor, count(*) as quantidade from recebidos group by forma) x
    ), '[]'::jsonb),
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'valor', valor, 'quantidade', quantidade) order by valor desc)
      from (select origem, sum(valor) as valor, count(*) as quantidade from recebidos group by origem) x
    ), '[]'::jsonb),
    'por_membro', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'valor', valor, 'quantidade', quantidade) order by valor desc)
      from (
        select m.nome, sum(r.valor) as valor, count(*) as quantidade
        from recebidos r join public.membros m on m.id = r.registrado_por
        group by m.nome
      ) x
    ), '[]'::jsonb),
    'comandas', jsonb_build_object(
      'fechadas', (select count(*) from public.comandas where caixa_sessao_id = p_sessao_id and status = 'fechada'),
      'canceladas', (select count(*) from public.comandas where caixa_sessao_id = p_sessao_id and status = 'cancelada'),
      -- Abertas no restaurante agora (impedem o fechamento do caixa).
      'abertas', (
        select count(*) from public.comandas c
        where c.restaurante_id = (select restaurante_id from sessao)
          and c.status in ('aberta', 'conta_pedida')
      )
    ),
    'pedidos_por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'quantidade', quantidade) order by quantidade desc)
      from (select origem, count(*) as quantidade from pedidos where status <> 'cancelado' group by origem) x
    ), '[]'::jsonb),
    'itens_mais_vendidos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome_produto, 'quantidade', quantidade, 'total', total) order by quantidade desc, total desc)
      from (
        select nome_produto, sum(quantidade) as quantidade, sum(total) as total
        from vendidos group by nome_produto
        order by sum(quantidade) desc, sum(total) desc
        limit 15
      ) x
    ), '[]'::jsonb),
    'itens_cancelados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', i.nome_produto, 'quantidade', i.quantidade, 'total', i.total,
        'motivo', i.motivo_cancelamento, 'em', i.cancelado_em, 'por', m.nome
      ) order by i.cancelado_em)
      from itens i left join public.membros m on m.id = i.cancelado_por
      where i.cancelado_em is not null
    ), '[]'::jsonb),
    'pedidos_cancelados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero, 'origem', p.origem, 'total', p.total,
        'motivo', p.motivo_cancelamento, 'em', p.cancelado_em, 'por', m.nome
      ) order by p.cancelado_em)
      from pedidos p left join public.membros m on m.id = p.cancelado_por
      where p.status = 'cancelado'
    ), '[]'::jsonb),
    'estornos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'forma', p.forma, 'valor', p.valor, 'em', p.estornado_em, 'por', m.nome, 'registrado_por', r.nome,
        'motivo', p.motivo_estorno
      ) order by p.estornado_em)
      from pagamentos p
      left join public.membros m on m.id = p.estornado_por
      left join public.membros r on r.id = p.registrado_por
      where p.estornado_em is not null
    ), '[]'::jsonb)
  ) end;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_vendas(p_restaurante_id uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_fuso text;
  v_resultado jsonb;
begin
  if not (select rest_privado.tem_papel(p_restaurante_id, array['dono'])) then
    raise exception 'Só o dono vê os relatórios.' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;

  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;

  with
  sessoes as (
    select s.id, s.aberta_em
    from public.caixa_sessoes s
    where s.restaurante_id = p_restaurante_id
      and (s.aberta_em at time zone v_fuso)::date between p_de and p_ate
  ),
  pedidos as (
    select p.*
    from public.pedidos p
    where p.restaurante_id = p_restaurante_id
      and p.caixa_sessao_id in (select id from sessoes)
  ),
  validos as (
    select * from pedidos where status <> 'cancelado'
  ),
  vendidos as (
    select i.*, p.origem, p.criado_em as pedido_em, p.caixa_sessao_id
    from public.itens_pedido i
    join validos p on p.id = i.pedido_id
    where i.restaurante_id = p_restaurante_id and i.cancelado_em is null
  ),
  -- Vendido por pedido (itens + taxa): base de origem, horário e bairro.
  por_pedido as (
    select p.id, p.origem, p.criado_em, p.caixa_sessao_id, p.bairro_id, p.endereco ->> 'bairro' as bairro_texto, p.taxa_entrega, p.comanda_id,
      coalesce((select sum(v.total) from vendidos v where v.pedido_id = p.id), 0) + p.taxa_entrega - p.desconto as vendido
    from validos p
  ),
  comandas as (
    select c.*
    from public.comandas c
    where c.restaurante_id = p_restaurante_id
      and c.caixa_sessao_id in (select id from sessoes)
  ),
  pagamentos as (
    select pg.*
    from public.pagamentos pg
    where pg.restaurante_id = p_restaurante_id
      and pg.caixa_sessao_id in (select id from sessoes)
  ),
  recebidos as (
    select * from pagamentos where estornado_em is null
  ),
  -- Contas = comandas fechadas + pedidos de delivery/balcão (pedidos de mesa são vários por comanda).
  contas_sessao as (
    select s.id,
      (select count(*) from comandas c where c.caixa_sessao_id = s.id and c.status = 'fechada')
      + (select count(*) from validos p where p.caixa_sessao_id = s.id and p.origem <> 'mesa') as contas
    from sessoes s
  )
  select jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'fuso', v_fuso,
    'sessoes', (select count(*) from sessoes),
    'vendido', coalesce((select sum(vendido) from por_pedido), 0),
    'recebido', coalesce((select sum(valor) from recebidos), 0),
    'contas', coalesce((select sum(contas) from contas_sessao), 0),
    'itens', coalesce((select sum(quantidade) from vendidos), 0),
    'taxas_entrega', coalesce((select sum(taxa_entrega) from validos), 0),
    'descontos', coalesce((select sum(desconto) from validos), 0),
    'servico', coalesce((select sum(servico) from comandas where status = 'fechada'), 0),
    'couvert', coalesce((select sum(couvert) from comandas where status = 'fechada'), 0),
    'pedidos_cancelados', jsonb_build_object(
      'quantidade', (select count(*) from pedidos where status = 'cancelado'),
      'valor', coalesce((select sum(total) from pedidos where status = 'cancelado'), 0)
    ),
    'itens_cancelados', jsonb_build_object(
      'quantidade', coalesce((
        select sum(i.quantidade) from public.itens_pedido i join validos p on p.id = i.pedido_id
        where i.restaurante_id = p_restaurante_id and i.cancelado_em is not null
      ), 0),
      'valor', coalesce((
        select sum(i.total) from public.itens_pedido i join validos p on p.id = i.pedido_id
        where i.restaurante_id = p_restaurante_id and i.cancelado_em is not null
      ), 0)
    ),
    'estornos', jsonb_build_object(
      'quantidade', (select count(*) from pagamentos where estornado_em is not null),
      'valor', coalesce((select sum(valor) from pagamentos where estornado_em is not null), 0)
    ),
    'por_sessao', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'aberta_em', s.aberta_em,
        'vendido', coalesce((select sum(vendido) from por_pedido p where p.caixa_sessao_id = s.id), 0),
        'contas', (select contas from contas_sessao c where c.id = s.id)
      ) order by s.aberta_em)
      from sessoes s
    ), '[]'::jsonb),
    -- Dia da semana da noite (0 = domingo), com quantas noites para tirar a média.
    'por_dia_semana', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'noites', noites, 'vendido', vendido) order by dia)
      from (
        select extract(dow from s.aberta_em at time zone v_fuso)::int as dia,
          count(*) as noites,
          coalesce(sum((select sum(vendido) from por_pedido p where p.caixa_sessao_id = s.id)), 0) as vendido
        from sessoes s
        group by 1
      ) x
    ), '[]'::jsonb),
    -- Hora em que o pedido foi lançado (no fuso do restaurante).
    'por_hora', coalesce((
      select jsonb_agg(jsonb_build_object('hora', hora, 'pedidos', pedidos, 'vendido', vendido) order by hora)
      from (
        select extract(hour from p.criado_em at time zone v_fuso)::int as hora, count(*) as pedidos, sum(p.vendido) as vendido
        from por_pedido p
        group by 1
      ) x
    ), '[]'::jsonb),
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'pedidos', pedidos, 'vendido', vendido) order by vendido desc)
      from (
        select p.origem,
          case when p.origem = 'mesa' then count(distinct p.comanda_id) else count(*) end as pedidos,
          sum(p.vendido) as vendido
        from por_pedido p
        group by p.origem
      ) x
    ), '[]'::jsonb),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'quantidade', quantidade, 'valor', valor) order by valor desc)
      from (select forma, count(*) as quantidade, sum(valor) as valor from recebidos group by forma) x
    ), '[]'::jsonb),
    -- Por produto (o nome é o mais recente lançado; a categoria é a atual do produto).
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'produto_id', produto_id, 'nome', nome, 'categoria', categoria, 'quantidade', quantidade, 'total', total
      ) order by quantidade desc, total desc)
      from (
        select v.produto_id,
          (array_agg(v.nome_produto order by v.criado_em desc))[1] as nome,
          (select c.nome from public.produtos pr join public.categorias c on c.id = pr.categoria_id where pr.id = v.produto_id) as categoria,
          sum(v.quantidade) as quantidade,
          sum(v.total) as total
        from vendidos v
        group by v.produto_id
      ) x
    ), '[]'::jsonb),
    'bairros', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'pedidos', pedidos, 'vendido', vendido, 'taxas', taxas) order by pedidos desc, vendido desc)
      from (
        select coalesce(b.nome, initcap(nullif(btrim(p.bairro_texto), '')), 'Sem bairro') as nome, count(*) as pedidos, sum(p.vendido) as vendido, sum(p.taxa_entrega) as taxas
        from por_pedido p
        left join public.bairros_entrega b on b.id = p.bairro_id
        where p.origem = 'delivery'
        group by 1
      ) x
    ), '[]'::jsonb),
    'garcons', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'comandas', comandas, 'vendido', vendido, 'pessoas', pessoas, 'servico', servico) order by vendido desc)
      from (
        select coalesce(m.nome, 'Sem garçom') as nome, count(*) as comandas, sum(c.subtotal) as vendido, sum(c.pessoas) as pessoas,
          sum(c.servico) as servico
        from comandas c
        left join public.membros m on m.id = c.garcom_id
        where c.status = 'fechada'
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;
