-- Painel da plataforma, versão 2 (pedido do cliente em 29/10): financeiro, ficha mais completa,
-- anotações internas e administradores pela tela. Tudo por RPCs admin_* que exigem admin.

-- Anotações internas da equipe da plataforma sobre um restaurante (o restaurante nunca vê).
create table rest_privado.admin_notas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  user_id uuid not null,
  texto text not null check (length(btrim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now()
);
create index admin_notas_restaurante_idx on rest_privado.admin_notas (restaurante_id, criado_em desc);
alter table rest_privado.admin_notas enable row level security;
revoke all on rest_privado.admin_notas from public, anon, authenticated;

-- Financeiro: assinaturas por plano e situação, inadimplentes e pagamentos recebidos (avisos do Asaas).
-- O valor de cada plano fica no app (src/lib/planos.ts); aqui vão as contagens e os pagamentos reais.
create or replace function public.admin_financeiro()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  return jsonb_build_object(
    'por_plano', coalesce((
      select jsonb_agg(jsonb_build_object('plano', plano, 'status', status, 'quantidade', n))
      from (select plano, status, count(*) as n from public.assinaturas group by plano, status) x
    ), '[]'::jsonb),
    'inadimplentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nome', r.nome, 'plano', a.plano, 'status', a.status,
        'periodo_termina_em', a.periodo_termina_em, 'fatura_url', a.fatura_url
      ) order by a.periodo_termina_em nulls first)
      from public.assinaturas a join public.restaurantes r on r.id = a.restaurante_id
      where a.status in ('atrasada', 'cancelada')
    ), '[]'::jsonb),
    -- Pagamentos: cada cobrança uma vez (cartão manda "confirmado" e depois "recebido").
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurante_id', r.id, 'nome', r.nome, 'valor', p.valor, 'em', p.em
      ) order by p.em desc)
      from (
        select distinct on (e.dados -> 'payment' ->> 'id')
          e.dados -> 'payment' ->> 'subscription' as assinatura,
          round(((e.dados -> 'payment' ->> 'value')::numeric) * 100)::integer as valor,
          e.recebido_em as em
        from rest_privado.cobranca_eventos e
        where e.evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
          and e.recebido_em > now() - interval '120 days'
        order by e.dados -> 'payment' ->> 'id', e.recebido_em
      ) p
      left join public.assinaturas a on a.provedor_assinatura_id = p.assinatura
      left join public.restaurantes r on r.id = a.restaurante_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_financeiro() from public, anon;
grant execute on function public.admin_financeiro() to authenticated;

-- Ficha: cobrança no Asaas, pedidos por noite (30 dias, fuso do restaurante) e anotações.
create or replace function public.admin_restaurante_detalhes(p_restaurante_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fuso text;
  v_assinatura text;
begin
  perform rest_privado.exigir_admin();
  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;
  if v_fuso is null then
    return null;
  end if;
  select provedor_assinatura_id into v_assinatura from public.assinaturas where restaurante_id = p_restaurante_id;

  return jsonb_build_object(
    'cobranca', (
      select jsonb_build_object(
        'provedor', a.provedor, 'cliente_id', a.provedor_cliente_id, 'assinatura_id', a.provedor_assinatura_id,
        'fatura_url', a.fatura_url,
        'eventos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'evento', e.evento, 'em', e.recebido_em,
            'valor', round(((e.dados -> 'payment' ->> 'value')::numeric) * 100)::integer,
            'vencimento', e.dados -> 'payment' ->> 'dueDate'
          ) order by e.recebido_em desc)
          from (
            select * from rest_privado.cobranca_eventos
            where v_assinatura is not null
              and coalesce(dados -> 'payment' ->> 'subscription', dados -> 'subscription' ->> 'id') = v_assinatura
            order by recebido_em desc limit 15
          ) e
        ), '[]'::jsonb)
      )
      from public.assinaturas a where a.restaurante_id = p_restaurante_id
    ),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia::date, 'pedidos', coalesce(x.pedidos, 0), 'vendido', coalesce(x.vendido, 0)) order by d.dia)
      from generate_series((now() at time zone v_fuso)::date - 29, (now() at time zone v_fuso)::date, interval '1 day') as d(dia)
      left join (
        select (criado_em at time zone v_fuso)::date as dia, count(*) as pedidos, sum(total) as vendido
        from public.pedidos
        where restaurante_id = p_restaurante_id and status <> 'cancelado' and criado_em > now() - interval '31 days'
        group by 1
      ) x on x.dia = d.dia::date
    ), '[]'::jsonb),
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object('texto', n.texto, 'em', n.criado_em, 'por', u.email) order by n.criado_em desc)
      from (select * from rest_privado.admin_notas where restaurante_id = p_restaurante_id order by criado_em desc limit 50) n
      left join auth.users u on u.id = n.user_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_restaurante_detalhes(uuid) from public, anon;
grant execute on function public.admin_restaurante_detalhes(uuid) to authenticated;

create or replace function public.admin_anotar(p_restaurante_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  if not exists (select 1 from public.restaurantes where id = p_restaurante_id) then
    raise exception 'Restaurante não encontrado.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_texto, ''))) = 0 then
    raise exception 'Escreva a anotação.' using errcode = 'P0001';
  end if;
  insert into rest_privado.admin_notas (restaurante_id, user_id, texto)
  values (p_restaurante_id, (select auth.uid()), btrim(p_texto));
end;
$$;
revoke all on function public.admin_anotar(uuid, text) from public, anon;
grant execute on function public.admin_anotar(uuid, text) to authenticated;

-- Administradores pela tela (antes só por SQL). Cada mudança fica no histórico (sem restaurante).
create or replace function public.admin_listar_admins()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'email', u.email, 'desde', a.criado_em,
      'ultimo_acesso', u.last_sign_in_at, 'voce', a.user_id = (select auth.uid())
    ) order by a.criado_em)
    from rest_privado.administradores a join auth.users u on u.id = a.user_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_listar_admins() from public, anon;
grant execute on function public.admin_listar_admins() to authenticated;

create or replace function public.admin_adicionar_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform rest_privado.exigir_admin();
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Não há conta com esse e-mail. A pessoa precisa se cadastrar antes.' using errcode = 'P0001';
  end if;
  if exists (select 1 from rest_privado.administradores where user_id = v_user) then
    raise exception 'Essa pessoa já é administradora.' using errcode = 'P0001';
  end if;
  insert into rest_privado.administradores (user_id) values (v_user);
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (null, (select auth.uid()), 'admin_adicionado', jsonb_build_object('email', lower(btrim(p_email))));
end;
$$;
revoke all on function public.admin_adicionar_admin(text) from public, anon;
grant execute on function public.admin_adicionar_admin(text) to authenticated;

create or replace function public.admin_remover_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  perform rest_privado.exigir_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'Você não pode tirar o seu próprio acesso.' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  delete from rest_privado.administradores where user_id = p_user_id;
  if not found then
    raise exception 'Essa pessoa não é administradora.' using errcode = 'P0001';
  end if;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (null, (select auth.uid()), 'admin_removido', jsonb_build_object('email', v_email));
end;
$$;
revoke all on function public.admin_remover_admin(uuid) from public, anon;
grant execute on function public.admin_remover_admin(uuid) to authenticated;
