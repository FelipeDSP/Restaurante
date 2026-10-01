-- RPCs públicas do site de delivery (chamáveis por anon).
-- Preços, taxa e totais vêm sempre do banco.

-- Situação do delivery para o site mostrar "aberto"/"fechado".
create function public.consultar_disponibilidade_delivery(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_restaurante public.restaurantes;
begin
  select * into v_restaurante from public.restaurantes
  where id = p_restaurante_id and ativo and excluido_em is null;

  if v_restaurante.id is null then
    return jsonb_build_object('aberto', false, 'motivo', 'restaurante_indisponivel');
  end if;
  if not v_restaurante.aceita_delivery then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_delivery');
  end if;
  if not rest_privado.esta_no_horario(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'fora_do_horario');
  end if;
  if not exists (
    select 1 from public.caixa_sessoes where restaurante_id = p_restaurante_id and fechada_em is null
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'caixa_fechado');
  end if;
  return jsonb_build_object('aberto', true, 'motivo', null);
end;
$$;

-- p_itens: [{"produto_id": uuid, "quantidade": int, "observacao": text?}, ...]
-- p_endereco: {"rua": text, "numero": text, "complemento"?: text, "referencia"?: text}
create function public.criar_pedido_delivery(
  p_restaurante_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_bairro_id uuid,
  p_endereco jsonb,
  p_forma_pagamento text,
  p_itens jsonb,
  p_troco_para integer default null,
  p_observacao text default null
)
returns jsonb
language plpgsql volatile security definer
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
begin
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

  -- Bairro atendido.
  select taxa into v_taxa
  from public.bairros_entrega
  where id = p_bairro_id and restaurante_id = p_restaurante_id and ativo;
  if v_taxa is null then
    raise exception 'Bairro não atendido.' using errcode = 'P0001';
  end if;

  -- Itens.
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido não tem itens.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'Itens demais no pedido.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    restaurante_id, origem, cliente_nome, cliente_telefone, endereco, bairro_id,
    taxa_entrega, forma_pagamento_prevista, troco_para, observacao
  ) values (
    p_restaurante_id, 'delivery', btrim(p_cliente_nome), v_telefone, p_endereco, p_bairro_id,
    v_taxa, p_forma_pagamento, case when p_forma_pagamento = 'dinheiro' then p_troco_para end,
    nullif(btrim(p_observacao), '')
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
      raise exception 'Produto indisponível para delivery.' using errcode = 'P0001';
    end if;

    -- Nome e preço são preenchidos pelo trigger a partir do cadastro.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao)
    values (p_restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, nullif(btrim(v_item ->> 'observacao'), ''));
  end loop;

  select subtotal, total into v_subtotal, v_total from public.pedidos where id = v_pedido_id;

  select pedido_minimo into v_pedido_minimo from public.restaurantes where id = p_restaurante_id;
  if v_subtotal < v_pedido_minimo then
    raise exception 'Pedido mínimo não atingido.' using errcode = 'P0001';
  end if;
  if p_forma_pagamento = 'dinheiro' and p_troco_para is not null and p_troco_para < v_total then
    raise exception 'O troco deve ser para um valor maior que o total.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'total', v_total);
end;
$$;

-- Acompanhamento público: só status, itens e totais (o uuid funciona como senha).
create function public.consultar_pedido_publico(p_pedido_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'numero', p.numero,
    'status', p.status,
    'criado_em', p.criado_em,
    'subtotal', p.subtotal,
    'taxa_entrega', p.taxa_entrega,
    'total', p.total,
    'forma_pagamento_prevista', p.forma_pagamento_prevista,
    'tempo_estimado_entrega_min', r.tempo_estimado_entrega_min,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome_produto', i.nome_produto,
        'quantidade', i.quantidade,
        'preco_unitario', i.preco_unitario,
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

revoke all on function
  public.consultar_disponibilidade_delivery(uuid),
  public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text),
  public.consultar_pedido_publico(uuid)
from public;

grant execute on function
  public.consultar_disponibilidade_delivery(uuid),
  public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text),
  public.consultar_pedido_publico(uuid)
to anon, authenticated;

-- esta_no_horario é chamada dentro das RPCs (security definer); não precisa de grant extra.
