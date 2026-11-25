-- O site do restaurante ganha cara própria: capa, uma linha sobre a casa e as redes.
--
-- Até aqui dois restaurantes diferentes só se distinguiam pelo tom do cabeçalho: logo, nome e
-- lista de produtos. A "cor de destaque" (`cor_secundaria`) era escolhida no painel com prévia e
-- não pintava quase nada — só o quadradinho da inicial (que some assim que sobe a logo) e a
-- bolinha do contador do carrinho. O dono mexia na cor e o site não mudava.
--
-- Duas mudanças, então. Esta migração traz o que faltava guardar:
--   capa_url   imagem larga no topo do cardápio (sem capa, não se inventa fundo nenhum)
--   descricao  uma linha sobre a casa, embaixo do nome
--   instagram  e facebook: o @ da casa, que vira ícone no site
-- A outra mudança é só de interface: `cor_secundaria` passa a ser a cor dos botões do site
-- (Adicionar, carrinho, fazer pedido). Por isso ela NÃO é mexida aqui — os quatro restaurantes de
-- hoje já têm um segundo tom que combina com o primeiro (preto+vermelho, verde+amarelo,
-- vinho+âmbar), escolhido quando ele não valia nada; agora vale, e o site deles melhora sozinho.

alter table public.restaurantes
  add column capa_url text,
  add column descricao text check (descricao is null or length(descricao) <= 160),
  -- Só o @, sem URL: o site monta o endereço. Assim ninguém cola um link para outro lugar.
  add column instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add column facebook text check (facebook is null or facebook ~ '^[A-Za-z0-9._-]{1,50}$');

comment on column public.restaurantes.capa_url is 'Imagem de capa do site. Null = sem capa (não se inventa fundo).';
comment on column public.restaurantes.descricao is 'Uma linha sobre a casa, mostrada embaixo do nome no site.';

grant select (capa_url, descricao, instagram, facebook) on public.restaurantes to anon, authenticated;
grant update (capa_url, descricao, instagram, facebook) on public.restaurantes to authenticated;

-- A view pública é o que o site lê (anon). As quatro novas entram no fim da lista porque
-- `create or replace view` só aceita acrescentar coluna no fim, nunca renomear uma do meio.
create or replace view public.restaurantes_publicos
with (security_invoker = true) as
select id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco, fuso_horario,
  horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, taxa_entrega_modo, taxa_entrega_fixa,
  capa_url, descricao, instagram, facebook
from public.restaurantes
where ativo and excluido_em is null;

-- Bucket da capa. Separado de rest-logos porque é foto grande (a logo cabe em 2 MB, a capa não
-- precisa caber), e as políticas são as mesmas: caminho {restaurante_id}/arquivo, só quem pode
-- mexer no restaurante escreve, qualquer um lê (bucket público, como as fotos dos produtos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rest-capas', 'rest-capas', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "rest: equipe le capas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rest-capas'
    and rest_privado.texto_para_uuid((storage.foldername(name))[1]) in (
      select rest_privado.meus_restaurantes()
    )
  );

create policy "rest: dono envia capa" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rest-capas'
    and (select rest_privado.tem_permissao(
      rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['restaurante']))
  );

create policy "rest: dono substitui capa" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'rest-capas'
    and (select rest_privado.tem_permissao(
      rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['restaurante']))
  )
  with check (
    bucket_id = 'rest-capas'
    and (select rest_privado.tem_permissao(
      rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['restaurante']))
  );

create policy "rest: dono apaga capa" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'rest-capas'
    and (select rest_privado.tem_permissao(
      rest_privado.texto_para_uuid((storage.foldername(name))[1]), array['restaurante']))
  );
