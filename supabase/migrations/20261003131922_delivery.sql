-- Delivery: acompanhamento com o restaurante do pedido e entrega com pagamento atômico.

-- Inclui restaurante_id para o site conferir que o pedido pertence ao restaurante da URL.
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

-- Marca o pedido como entregue e registra o pagamento recebido na entrega (tudo ou nada).
-- security invoker: RLS e triggers validam (membro, caixa aberto, pedido não cancelado).
create function public.entregar_pedido_delivery(p_pedido_id uuid, p_forma text)
returns void
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  v_pedido record;
begin
  select id, restaurante_id, total, status, origem into v_pedido
  from public.pedidos where id = p_pedido_id;

  if v_pedido.id is null or v_pedido.origem <> 'delivery' then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_pedido.status in ('entregue', 'cancelado') then
    raise exception 'Pedido já finalizado.' using errcode = 'P0001';
  end if;
  if p_forma not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;

  -- Desconta o que já foi pago (ex.: pagamento registrado antes por engano).
  if v_pedido.total > coalesce((
    select sum(valor) from public.pagamentos where pedido_id = p_pedido_id and estornado_em is null
  ), 0) then
    -- caixa_sessao_id e registrado_por são sobrescritos pelo trigger (caixa aberto e usuário logado).
    insert into public.pagamentos (restaurante_id, pedido_id, caixa_sessao_id, valor, forma, registrado_por)
    values (
      v_pedido.restaurante_id, p_pedido_id, '00000000-0000-0000-0000-000000000000',
      v_pedido.total - coalesce((
        select sum(valor) from public.pagamentos where pedido_id = p_pedido_id and estornado_em is null
      ), 0),
      p_forma, '00000000-0000-0000-0000-000000000000'
    );
  end if;

  update public.pedidos set status = 'entregue' where id = p_pedido_id;
end;
$$;

revoke all on function public.entregar_pedido_delivery(uuid, text) from public, anon;
grant execute on function public.entregar_pedido_delivery(uuid, text) to authenticated;
