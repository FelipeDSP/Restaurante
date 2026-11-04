-- Conta do cliente do delivery sem SMS (pedido do cliente em 04/11): entra com Google ou com um
-- código por e-mail. O celular para contato passa a ser informado por ele (sem confirmação); quem
-- entrou pelo SMS continua com o telefone confirmado, que não muda por aqui.
-- Conta da equipe (está em `membros`) não vira cliente: com e-mail para os dois, o banco separa.

alter table public.clientes add constraint clientes_telefone_valido check (telefone ~ '^\d{10,13}$');

-- Celular só com números e o 55 do Brasil (o mesmo formato do Auth); null quando não serve.
create or replace function rest_privado.telefone_cliente(p_telefone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^\d{10,11}$' then '55' || d
    when d ~ '^55\d{10,11}$' then d
  end
  from (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as d) t;
$$;

drop function public.entrar_como_cliente(uuid, text);
create function public.entrar_como_cliente(p_restaurante_id uuid, p_nome text, p_telefone text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_confirmado text;
  v_telefone text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Entre para continuar.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros where user_id = v_uid and ativo) then
    raise exception 'Esta conta é da equipe de um restaurante. Para pedir, entre com outro e-mail.' using errcode = 'P0001';
  end if;

  select regexp_replace(u.phone, '\D', '', 'g') into v_confirmado
  from auth.users u
  where u.id = v_uid and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';
  v_telefone := coalesce(v_confirmado, rest_privado.telefone_cliente(p_telefone));
  if v_telefone is null then
    raise exception 'Informe o seu celular com DDD.' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_nome, ''))) not between 2 and 120 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.restaurantes r where r.id = p_restaurante_id and r.ativo and r.excluido_em is null
  ) then
    raise exception 'Restaurante não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.clientes as c (restaurante_id, user_id, nome, telefone)
  values (p_restaurante_id, v_uid, btrim(p_nome), v_telefone)
  on conflict (restaurante_id, user_id) do update
    set nome = excluded.nome,
        telefone = case when v_confirmado is null then excluded.telefone else c.telefone end
  returning c.id into v_id;
  return v_id;
end;
$$;
revoke all on function public.entrar_como_cliente(uuid, text, text) from public, anon;
grant execute on function public.entrar_como_cliente(uuid, text, text) to authenticated;

-- "Minha conta": nome e, sem telefone confirmado pelo SMS, o celular.
create or replace function public.atualizar_meu_cadastro_cliente(p_restaurante_id uuid, p_nome text, p_telefone text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_confirmado boolean;
  v_telefone text := rest_privado.telefone_cliente(p_telefone);
begin
  if length(btrim(coalesce(p_nome, ''))) not between 2 and 120 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;
  select exists (
    select 1 from auth.users u where u.id = v_uid and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> ''
  ) into v_confirmado;
  if not v_confirmado and v_telefone is null then
    raise exception 'Informe o seu celular com DDD.' using errcode = 'P0001';
  end if;

  update public.clientes
  set nome = btrim(p_nome),
      telefone = case when v_confirmado then telefone else v_telefone end
  where restaurante_id = p_restaurante_id and user_id = v_uid;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.atualizar_meu_cadastro_cliente(uuid, text, text) from public, anon;
grant execute on function public.atualizar_meu_cadastro_cliente(uuid, text, text) to authenticated;
revoke all on function rest_privado.telefone_cliente(text) from public, anon, authenticated;
