-- Taxa de serviço (ex.: 10% do garçom) e couvert por pessoa em dias escolhidos, só nas mesas.
-- Configuração no restaurante; a comanda guarda o percentual e o couvert do momento em que abriu
-- (mudar a configuração no meio da noite não mexe nas mesas abertas). comandas.total continua sendo
-- o total a pagar (itens + serviço + couvert): pagamento, fechamento e listas seguem iguais.

alter table public.restaurantes
  add column servico_percentual smallint not null default 0 check (servico_percentual between 0 and 30),
  add column couvert_valor integer not null default 0 check (couvert_valor between 0 and 100000),
  -- 0 = domingo ... 6 = sábado (no fuso do restaurante).
  add column couvert_dias smallint[] not null default '{}' check (couvert_dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

grant update (servico_percentual, couvert_valor, couvert_dias) on public.restaurantes to authenticated;

alter table public.comandas
  add column subtotal integer not null default 0 check (subtotal >= 0),
  add column servico_percentual smallint not null default 0 check (servico_percentual between 0 and 30),
  add column cobrar_servico boolean not null default false,
  add column servico integer not null default 0 check (servico >= 0),
  add column couvert_unitario integer not null default 0 check (couvert_unitario >= 0),
  add column cobrar_couvert boolean not null default false,
  add column couvert integer not null default 0 check (couvert >= 0);

-- Comandas que já existiam: subtotal = total (não tinham serviço nem couvert).
update public.comandas set subtotal = total;

create or replace function rest_privado.comandas_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid := rest_privado.membro_atual(new.restaurante_id);
  v_r record;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  if not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  -- Garçom sempre abre em seu próprio nome; dono/caixa podem indicar o garçom.
  if rest_privado.papel_atual(new.restaurante_id) = 'garcom' then
    new.garcom_id := v_membro;
  else
    new.garcom_id := coalesce(new.garcom_id, v_membro);
  end if;

  -- Serviço e couvert do momento em que a mesa abre.
  select servico_percentual, couvert_valor, couvert_dias, fuso_horario into v_r
  from public.restaurantes where id = new.restaurante_id;
  new.servico_percentual := v_r.servico_percentual;
  new.cobrar_servico := v_r.servico_percentual > 0;
  new.couvert_unitario := v_r.couvert_valor;
  new.cobrar_couvert := v_r.couvert_valor > 0
    and extract(dow from now() at time zone v_r.fuso_horario)::smallint = any (v_r.couvert_dias);

  new.status := 'aberta';
  new.subtotal := 0;
  new.servico := 0;
  new.couvert := case when new.cobrar_couvert then new.couvert_unitario * coalesce(new.pessoas, 0) else 0 end;
  new.total := new.couvert;
  new.aberta_em := now();
  new.fechada_em := null;
  new.fechada_por := null;
  return new;
end;
$$;

create or replace function rest_privado.comandas_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal integer;
  v_pago integer;
begin
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.aberta_em := old.aberta_em;
  new.servico_percentual := old.servico_percentual;
  new.couvert_unitario := old.couvert_unitario;

  select coalesce(sum(total), 0) into v_subtotal
  from public.pedidos
  where comanda_id = new.id and status <> 'cancelado';

  if old.status in ('fechada', 'cancelada') then
    if new.status <> old.status or v_subtotal <> old.subtotal or new.mesa_id <> old.mesa_id then
      raise exception 'Comanda já encerrada.' using errcode = 'P0001';
    end if;
    new := old;
    return new;
  end if;

  if new.garcom_id is distinct from old.garcom_id
     and (select auth.uid()) is not null
     and not rest_privado.tem_papel(new.restaurante_id, array['dono', 'caixa']) then
    raise exception 'Apenas dono ou caixa trocam o garçom da mesa.' using errcode = 'P0001';
  end if;

  -- Sem percentual/valor configurado não há o que cobrar.
  new.cobrar_servico := new.cobrar_servico and new.servico_percentual > 0;
  new.cobrar_couvert := new.cobrar_couvert and new.couvert_unitario > 0;

  new.subtotal := v_subtotal;
  new.servico := case when new.cobrar_servico then round(v_subtotal * new.servico_percentual / 100.0)::integer else 0 end;
  new.couvert := case when new.cobrar_couvert then new.couvert_unitario * coalesce(new.pessoas, 0) else 0 end;
  new.total := new.subtotal + new.servico + new.couvert;

  if new.total < old.total then
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos where comanda_id = new.id and estornado_em is null;
    if v_pago > new.total then
      raise exception 'O total ficaria menor que o já pago. Estorne um pagamento antes.' using errcode = 'P0001';
    end if;
  end if;

  if new.mesa_id <> old.mesa_id and not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  if new.status = 'fechada' then
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos
    where comanda_id = new.id and estornado_em is null;

    if v_pago < new.total then
      raise exception 'Comanda não quitada: faltam % centavos.', new.total - v_pago using errcode = 'P0001';
    end if;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
  elsif new.status = 'cancelada' then
    if coalesce(rest_privado.papel_atual(new.restaurante_id), '') not in ('dono', 'caixa') then
      raise exception 'Apenas dono ou caixa podem cancelar uma comanda.' using errcode = 'P0001';
    end if;
    if v_subtotal <> 0 then
      raise exception 'Cancele os itens antes de cancelar a comanda.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pagamentos where comanda_id = new.id and estornado_em is null) then
      raise exception 'Estorne os pagamentos antes de cancelar a comanda.' using errcode = 'P0001';
    end if;
    new.servico := 0;
    new.couvert := 0;
    new.total := 0;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.fechada_em := null;
    new.fechada_por := null;
  end if;
  return new;
end;
$$;

-- Resumo do caixa e relatórios: serviço e couvert à parte; por garçom, o serviço que ele gerou.
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
      + coalesce((select sum(taxa_entrega) from pedidos where status <> 'cancelado'), 0),
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
