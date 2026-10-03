-- Resumo de uma sessão de caixa (o resumo é por sessão, não por dia do calendário).
-- security invoker: só retorna dados de sessões do restaurante de quem chama (RLS).
--
-- Critérios:
-- - Recebido: pagamentos não estornados registrados na sessão (regime de caixa).
-- - Vendido: itens não cancelados + taxas de entrega dos pedidos criados na sessão.
-- - Origem do pagamento: comanda = mesa; pedido = origem do pedido (delivery/balcão).
create function public.resumo_caixa_sessao(p_sessao_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
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
    'total_vendido',
      coalesce((select sum(total) from vendidos), 0)
      + coalesce((select sum(taxa_entrega) from pedidos where status <> 'cancelado'), 0),
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
        'forma', p.forma, 'valor', p.valor, 'em', p.estornado_em, 'por', m.nome, 'registrado_por', r.nome
      ) order by p.estornado_em)
      from pagamentos p
      left join public.membros m on m.id = p.estornado_por
      left join public.membros r on r.id = p.registrado_por
      where p.estornado_em is not null
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.resumo_caixa_sessao(uuid) from public, anon;
grant execute on function public.resumo_caixa_sessao(uuid) to authenticated;
