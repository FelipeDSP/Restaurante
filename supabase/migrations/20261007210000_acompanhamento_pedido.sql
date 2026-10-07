-- Acompanhamento do pedido pelo cliente: também o endereço de entrega, o troco,
-- a observação e o motivo do cancelamento (quem tem o link é quem fez o pedido;
-- o id é um uuid impossível de adivinhar).
create or replace function public.consultar_pedido_publico(p_pedido_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'restaurante_id', p.restaurante_id,
    'numero', p.numero,
    'status', p.status,
    'criado_em', p.criado_em,
    'subtotal', p.subtotal,
    'taxa_entrega', p.taxa_entrega,
    'total', p.total,
    'forma_pagamento_prevista', p.forma_pagamento_prevista,
    'troco_para', p.troco_para,
    'observacao', p.observacao,
    'endereco', jsonb_build_object(
      'rua', p.endereco ->> 'rua',
      'numero', p.endereco ->> 'numero',
      'complemento', p.endereco ->> 'complemento',
      'referencia', p.endereco ->> 'referencia',
      'bairro', b.nome
    ),
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
  left join public.bairros_entrega b on b.id = p.bairro_id
  where p.id = p_pedido_id
    and p.origem = 'delivery'
    and r.ativo and r.excluido_em is null;
$$;
