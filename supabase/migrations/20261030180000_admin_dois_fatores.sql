-- Super admin em duas etapas (pedido do cliente em 30/10): senha + código de 6 números enviado
-- por e-mail. Só a sessão que confirmou o código usa as funções admin_* (a trava fica no banco:
-- com só a senha, nem chamando a API direto). O servidor do app gera o código e manda o e-mail.

-- Código pendente de cada admin (só o hash; vale 10 min e 5 tentativas).
create table rest_privado.admin_codigos (
  user_id uuid primary key,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas integer not null default 0,
  criado_em timestamptz not null default now()
);
alter table rest_privado.admin_codigos enable row level security;
revoke all on rest_privado.admin_codigos from public, anon, authenticated;

-- Sessões (do Supabase Auth) que passaram pelo código; valem 12 h.
create table rest_privado.admin_sessoes (
  session_id uuid primary key,
  user_id uuid not null,
  verificada_em timestamptz not null default now(),
  expira_em timestamptz not null
);
alter table rest_privado.admin_sessoes enable row level security;
revoke all on rest_privado.admin_sessoes from public, anon, authenticated;

-- A sessão atual já confirmou o código?
create or replace function rest_privado.admin_sessao_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from rest_privado.admin_sessoes s
    where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
      and s.expira_em > now()
  );
$$;

-- Todas as funções admin_* passam por aqui: agora exige também a segunda etapa.
create or replace function rest_privado.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rest_privado.eh_admin_plataforma() or not rest_privado.admin_sessao_ok() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function rest_privado.exigir_admin() from public, anon, authenticated;

-- Para o app saber se manda para a etapa do código.
create or replace function public.admin_sessao_verificada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select rest_privado.eh_admin_plataforma() and rest_privado.admin_sessao_ok();
$$;
revoke all on function public.admin_sessao_verificada() from public, anon;
grant execute on function public.admin_sessao_verificada() to authenticated;

-- Só o servidor (chave secreta) guarda o código; quem tem só a senha não consegue ler o código.
create or replace function public.admin_guardar_codigo(p_user_id uuid, p_codigo_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from rest_privado.administradores where user_id = p_user_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_codigo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Código inválido.' using errcode = 'P0001';
  end if;
  insert into rest_privado.admin_codigos (user_id, codigo_hash, expira_em, tentativas, criado_em)
  values (p_user_id, p_codigo_hash, now() + interval '10 minutes', 0, now())
  on conflict (user_id) do update
    set codigo_hash = excluded.codigo_hash, expira_em = excluded.expira_em, tentativas = 0, criado_em = now();
end;
$$;
revoke all on function public.admin_guardar_codigo(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_guardar_codigo(uuid, text) to service_role;

-- A sessão (que já passou pela senha) confirma o código; a partir daí ela vale como admin.
create or replace function public.admin_confirmar_codigo(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sessao uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_codigo rest_privado.admin_codigos;
begin
  if v_uid is null or v_sessao is null or not rest_privado.eh_admin_plataforma() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_codigo from rest_privado.admin_codigos where user_id = v_uid for update;
  if not found or v_codigo.expira_em < now() then
    raise exception 'O código venceu. Peça outro.' using errcode = 'P0001';
  end if;
  if v_codigo.tentativas >= 5 then
    raise exception 'Muitas tentativas. Peça outro código.' using errcode = 'P0001';
  end if;
  if encode(extensions.digest(regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'), 'sha256'), 'hex') <> v_codigo.codigo_hash then
    update rest_privado.admin_codigos set tentativas = tentativas + 1 where user_id = v_uid;
    return false;
  end if;

  delete from rest_privado.admin_codigos where user_id = v_uid;
  delete from rest_privado.admin_sessoes where expira_em < now();
  insert into rest_privado.admin_sessoes (session_id, user_id, expira_em)
  values (v_sessao, v_uid, now() + interval '12 hours')
  on conflict (session_id) do update set user_id = excluded.user_id, verificada_em = now(), expira_em = excluded.expira_em;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (null, v_uid, 'entrou_no_admin', '{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.admin_confirmar_codigo(text) from public, anon;
grant execute on function public.admin_confirmar_codigo(text) to authenticated;
