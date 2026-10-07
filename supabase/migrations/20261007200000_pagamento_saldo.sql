-- Pagamentos: nunca acima do que falta e estorno com motivo.
--
-- Garçom e caixa (ou dois garçons) cobrando a mesma mesa ao mesmo tempo eram os dois aceitos
-- e a comanda fechava com o dobro. Agora o pagamento trava a comanda (ou o pedido) e confere
-- o saldo já com os pagamentos de quem chegou antes. O troco do dinheiro não entra: registra-se
-- o valor da conta, não o que o cliente entregou.

alter table public.pagamentos add column motivo_estorno text
  check (motivo_estorno is null or length(motivo_estorno) between 3 and 500);

create function rest_privado.texto_reais(p_centavos integer)
returns text
language sql immutable
set search_path = ''
as $$
  select 'R$ ' || replace(to_char(p_centavos / 100.0, 'FM999999990.00'), '.', ',');
$$;

create or replace function rest_privado.pagamentos_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status text;
  v_origem text;
  v_total integer;
  v_pago integer;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);
  new.registrado_por := rest_privado.membro_atual(new.restaurante_id);
  if new.registrado_por is null then
    raise exception 'Usuário não é membro do restaurante.' using errcode = 'P0001';
  end if;

  -- for update: dois pagamentos simultâneos da mesma conta passam um de cada vez.
  if new.comanda_id is not null then
    select status, total into v_status, v_total
    from public.comandas
    where id = new.comanda_id and restaurante_id = new.restaurante_id
    for update;
    if v_status is null or v_status not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos where comanda_id = new.comanda_id and estornado_em is null;
  else
    select status, origem, total into v_status, v_origem, v_total
    from public.pedidos
    where id = new.pedido_id and restaurante_id = new.restaurante_id
    for update;
    if v_status is null or v_status = 'cancelado' then
      raise exception 'Pedido inválido ou cancelado.' using errcode = 'P0001';
    end if;
    if v_origem = 'mesa' then
      raise exception 'Pagamento de mesa deve ser registrado na comanda.' using errcode = 'P0001';
    end if;
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos where pedido_id = new.pedido_id and estornado_em is null;
  end if;

  if v_pago >= v_total then
    raise exception 'Esta conta já está paga (alguém registrou o pagamento agora há pouco).' using errcode = 'P0001';
  end if;
  if new.valor > v_total - v_pago then
    raise exception 'Valor maior que o que falta (%). Confira os pagamentos já registrados.',
      rest_privado.texto_reais(v_total - v_pago) using errcode = 'P0001';
  end if;

  new.criado_em := now();
  new.estornado_em := null;
  new.estornado_por := null;
  new.motivo_estorno := null;
  return new;
end;
$$;

-- Pagamento só pode ser estornado (com motivo); nenhum outro campo muda.
create or replace function rest_privado.pagamentos_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.estornado_em is not null then
    raise exception 'Pagamento já estornado.' using errcode = 'P0001';
  end if;

  new.comanda_id := old.comanda_id;
  new.pedido_id := old.pedido_id;
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.valor := old.valor;
  new.forma := old.forma;
  new.registrado_por := old.registrado_por;
  new.criado_em := old.criado_em;

  if new.estornado_em is not null then
    if old.comanda_id is not null and exists (
      select 1 from public.comandas where id = old.comanda_id and status = 'fechada'
    ) then
      raise exception 'Comanda fechada: não é possível estornar.' using errcode = 'P0001';
    end if;
    new.motivo_estorno := nullif(trim(new.motivo_estorno), '');
    if new.motivo_estorno is null or length(new.motivo_estorno) < 3 then
      raise exception 'Informe o motivo do estorno.' using errcode = 'P0001';
    end if;
    new.estornado_em := now();
    new.estornado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.estornado_por := null;
    new.motivo_estorno := null;
  end if;
  return new;
end;
$$;

-- Resumo da sessão: estornos com o motivo.
create or replace function public.resumo_caixa_sessao(p_sessao_id uuid)
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
        'forma', p.forma, 'valor', p.valor, 'em', p.estornado_em, 'por', m.nome, 'registrado_por', r.nome,
        'motivo', p.motivo_estorno
      ) order by p.estornado_em)
      from pagamentos p
      left join public.membros m on m.id = p.estornado_por
      left join public.membros r on r.id = p.registrado_por
      where p.estornado_em is not null
    ), '[]'::jsonb)
  ) end;
$$;


revoke all on function rest_privado.texto_reais(integer) from public, anon, authenticated;
