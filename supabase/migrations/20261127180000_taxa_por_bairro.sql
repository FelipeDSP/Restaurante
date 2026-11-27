-- Taxa por bairro de volta (decisão do dono em 27/11), com os três furos que fizeram o modo
-- ficar fora do ar em 26/10 ("por bairro ainda tem que ser melhor pensado"):
--
--   1. O cliente escolhia o bairro num select — e podia escolher o mais barato. Agora **o CEP
--      decide**: o ViaCEP devolve o bairro e o banco casa com a lista. O id continua aceito,
--      como saída para quando o CEP não resolve.
--   2. Bairro fora da lista perdia o pedido. Agora `taxa_outros_bairros` cobra uma taxa padrão
--      (nulo = continua recusando, para quem atende área fechada mesmo).
--   3. Cadastrar era digitar a cidade inteira. A tela passa a sugerir os bairros que já
--      apareceram em pedidos (nada aqui no banco: é consulta do painel).

-- ---------------------------------------------------------------------------
-- Comparar nome de bairro
-- ---------------------------------------------------------------------------

-- "São Cristóvão", "sao cristovao" e "Sao  Cristovão" são o mesmo bairro: o dono digita de um
-- jeito e o ViaCEP devolve de outro. Sem `unaccent` de propósito — instalar extensão num projeto
-- Supabase compartilhado mexe onde não é nosso, e aqui bastam os acentos do português.
--
-- O mesmo cálculo existe em `chaveBairro()` (src/lib/endereco.ts), que o checkout usa para
-- mostrar a taxa antes de enviar. Mudou aqui, muda lá.
create or replace function rest_privado.chave_bairro(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(
      translate(
        lower(coalesce(p_nome, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

revoke all on function rest_privado.chave_bairro(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Taxa para quem está fora da lista
-- ---------------------------------------------------------------------------

alter table public.restaurantes
  add column taxa_outros_bairros integer check (taxa_outros_bairros is null or taxa_outros_bairros >= 0);

comment on column public.restaurantes.taxa_outros_bairros is
  'Modo bairro: taxa cobrada quando o bairro do cliente não está na lista. Nulo = não entrega fora da lista.';

grant select (taxa_outros_bairros) on public.restaurantes to anon, authenticated;
grant update (taxa_outros_bairros) on public.restaurantes to authenticated;

create or replace view public.restaurantes_publicos
with (security_invoker = true) as
select id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco, fuso_horario,
  horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, taxa_entrega_modo, taxa_entrega_fixa,
  capa_url, descricao, instagram, facebook, aceita_retirada, tempo_estimado_retirada_min, taxa_outros_bairros
from public.restaurantes
where ativo and excluido_em is null;

-- ---------------------------------------------------------------------------
-- Criar o pedido: o bairro vem do CEP
-- ---------------------------------------------------------------------------

create or replace function public.criar_pedido_delivery(
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
  v_bairro_texto text;
  v_taxa_outros integer;
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
    v_bairro_texto := btrim(coalesce(p_endereco ->> 'bairro', ''));

    select taxa_entrega_modo, taxa_entrega_fixa, taxa_outros_bairros
      into v_modo, v_taxa, v_taxa_outros
    from public.restaurantes where id = p_restaurante_id;

    if v_modo = 'fixa' then
      -- Uma taxa para qualquer endereço; o bairro vai como texto (o cliente informa pelo CEP).
      if v_bairro_texto = '' then
        raise exception 'Informe o bairro.' using errcode = 'P0001';
      end if;
      v_bairro_id := null;
    else
      -- Por bairro. O id é a saída de quando o CEP não resolveu (o cliente escolheu na lista);
      -- o caminho normal é casar o nome que veio do CEP com a lista do restaurante.
      if p_bairro_id is not null then
        select id, taxa into v_bairro_id, v_taxa
        from public.bairros_entrega
        where id = p_bairro_id and restaurante_id = p_restaurante_id and ativo;
      end if;
      if v_bairro_id is null and v_bairro_texto <> '' then
        select id, taxa into v_bairro_id, v_taxa
        from public.bairros_entrega
        where restaurante_id = p_restaurante_id and ativo
          and rest_privado.chave_bairro(nome) = rest_privado.chave_bairro(v_bairro_texto);
      end if;
      if v_bairro_id is null then
        -- Fora da lista: cobra a taxa padrão, se o restaurante definiu uma. Sem ela, não atende.
        if v_bairro_texto = '' then
          raise exception 'Informe o bairro.' using errcode = 'P0001';
        end if;
        if v_taxa_outros is null then
          raise exception 'Ainda não entregamos no bairro %. Fale com o restaurante pelo WhatsApp.', v_bairro_texto
            using errcode = 'P0001';
        end if;
        v_taxa := v_taxa_outros;
      end if;
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
