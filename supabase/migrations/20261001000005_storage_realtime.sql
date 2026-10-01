-- Buckets de imagens (prefixo rest-) e tabelas no Realtime.
-- Caminho dos arquivos: {restaurante_id}/{nome-do-arquivo}. Só o dono do restaurante escreve.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('rest-logos', 'rest-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('rest-produtos', 'rest-produtos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "rest: dono le imagens do restaurante" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('rest-logos', 'rest-produtos')
    and (select rest_privado.tem_papel(rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['dono']))
  );

create policy "rest: dono envia imagens do restaurante" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('rest-logos', 'rest-produtos')
    and (select rest_privado.tem_papel(rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['dono']))
  );

create policy "rest: dono substitui imagens do restaurante" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('rest-logos', 'rest-produtos')
    and (select rest_privado.tem_papel(rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['dono']))
  )
  with check (
    bucket_id in ('rest-logos', 'rest-produtos')
    and (select rest_privado.tem_papel(rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['dono']))
  );

create policy "rest: dono apaga imagens do restaurante" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('rest-logos', 'rest-produtos')
    and (select rest_privado.tem_papel(rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['dono']))
  );

-- Realtime (respeita RLS; o cliente filtra por restaurante_id).
alter publication supabase_realtime add table public.pedidos, public.comandas, public.itens_pedido;
