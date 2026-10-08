-- Relatórios do dono: um período inteiro (várias sessões de caixa).
-- Como no resumo da sessão, o "dia" é a noite de trabalho: entra a sessão de caixa aberta entre
-- as datas (no fuso do restaurante), com tudo o que aconteceu nela, mesmo depois da meia-noite.
-- Mesmas definições do resumo_caixa_sessao: vendido = itens não cancelados de pedidos não
-- cancelados + taxa de entrega; recebido = pagamentos não estornados.

create function public.relatorio_vendas(p_restaurante_id uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
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
    select p.id, p.origem, p.criado_em, p.caixa_sessao_id, p.bairro_id, p.taxa_entrega, p.comanda_id,
      coalesce((select sum(v.total) from vendidos v where v.pedido_id = p.id), 0) + p.taxa_entrega as vendido
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
        select coalesce(b.nome, 'Sem bairro') as nome, count(*) as pedidos, sum(p.vendido) as vendido, sum(p.taxa_entrega) as taxas
        from por_pedido p
        left join public.bairros_entrega b on b.id = p.bairro_id
        where p.origem = 'delivery'
        group by 1
      ) x
    ), '[]'::jsonb),
    'garcons', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'comandas', comandas, 'vendido', vendido, 'pessoas', pessoas) order by vendido desc)
      from (
        select coalesce(m.nome, 'Sem garçom') as nome, count(*) as comandas, sum(c.total) as vendido, sum(c.pessoas) as pessoas
        from comandas c
        left join public.membros m on m.id = c.garcom_id
        where c.status = 'fechada'
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.relatorio_vendas(uuid, date, date) from public, anon;
grant execute on function public.relatorio_vendas(uuid, date, date) to authenticated;
