-- "Meu perfil" (pedido do cliente em 30/10): cada pessoa da equipe muda a própria foto, nome e
-- telefone. E-mail e senha são do Auth (a própria sessão). O resto do cadastro (função, permissões,
-- ativo) continua só com o dono.

alter table public.membros
  add column foto_url text check (foto_url is null or length(foto_url) <= 500),
  add column telefone text check (telefone is null or telefone ~ '^[0-9]{10,13}$');

-- Leitura por coluna (o navegador não lê tudo de membros): as novas também são visíveis à equipe.
grant select (foto_url, telefone) on public.membros to authenticated;

-- Fotos da equipe: pasta = id do usuário; cada um só escreve na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rest-avatares', 'rest-avatares', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "rest: pessoa le a propria foto" on storage.objects
  for select to authenticated
  using (bucket_id = 'rest-avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "rest: pessoa envia a propria foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rest-avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "rest: pessoa substitui a propria foto" on storage.objects
  for update to authenticated
  using (bucket_id = 'rest-avatares' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'rest-avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "rest: pessoa apaga a propria foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'rest-avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Grava nome, telefone e foto em todos os restaurantes da pessoa (é a mesma pessoa).
-- A foto tem que ser do bucket rest-avatares, na pasta dela.
create or replace function public.atualizar_meu_perfil(p_nome text, p_telefone text, p_foto_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_telefone text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_foto text := nullif(btrim(coalesce(p_foto_url, '')), '');
begin
  if v_uid is null then
    raise exception 'Entre de novo para mudar o perfil.' using errcode = 'P0001';
  end if;
  if length(v_nome) not between 1 and 80 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;
  if v_telefone is not null and v_telefone !~ '^[0-9]{10,13}$' then
    raise exception 'Telefone inválido: use DDD e número.' using errcode = 'P0001';
  end if;
  if v_foto is not null and v_foto !~ ('/storage/v1/object/public/rest-avatares/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Foto inválida.' using errcode = 'P0001';
  end if;
  update public.membros set nome = v_nome, telefone = v_telefone, foto_url = v_foto where user_id = v_uid;
  if not found then
    raise exception 'Você não faz parte de nenhuma equipe.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.atualizar_meu_perfil(text, text, text) from public, anon;
grant execute on function public.atualizar_meu_perfil(text, text, text) to authenticated;
