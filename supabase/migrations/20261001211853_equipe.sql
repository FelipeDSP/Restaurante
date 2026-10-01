-- Equipe: garantias para o cadastro de membros pelo dono.

-- Todo restaurante mantém pelo menos um dono ativo (evita o dono se trancar fora).
create function rest_privado.membros_manter_dono()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.papel = 'dono' and old.ativo
     and (new.papel <> 'dono' or not new.ativo)
     and not exists (
       select 1 from public.membros
       where restaurante_id = old.restaurante_id
         and id <> old.id
         and papel = 'dono'
         and ativo
     ) then
    raise exception 'O restaurante precisa de pelo menos um dono ativo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger t10_manter_dono before update on public.membros
  for each row execute function rest_privado.membros_manter_dono();

revoke all on function rest_privado.membros_manter_dono() from public, anon, authenticated;

-- Busca o id de um usuário pelo e-mail. Só o servidor (service_role) chama,
-- depois de verificar que quem pede é dono do restaurante.
create function public.buscar_usuario_por_email(p_email text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

revoke all on function public.buscar_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.buscar_usuario_por_email(text) to service_role;

-- Restaurantes em que o usuário é membro (usado para limitar a troca de senha pelo dono).
create function public.contar_restaurantes_do_usuario(p_user_id uuid)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select count(*)::integer from public.membros where user_id = p_user_id;
$$;

revoke all on function public.contar_restaurantes_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.contar_restaurantes_do_usuario(uuid) to service_role;
