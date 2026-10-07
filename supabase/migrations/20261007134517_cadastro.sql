-- Cadastro self-service: endereços reservados, assinatura (teste grátis) e criação do
-- restaurante pelo próprio dono logado.

-- ---------------------------------------------------------------------------
-- Endereços reservados (rotas do app e páginas do produto)
-- ---------------------------------------------------------------------------

-- Rotas fixas do Next têm prioridade sobre /[slug]: um restaurante com um desses
-- endereços ficaria inacessível.
create function rest_privado.slug_reservado(p_slug text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_slug = any (array[
    -- app
    'login', 'entrar', 'sair', 'painel', 'garcom', 'inicio', 'selecionar', 'sem-acesso',
    'cadastro', 'comecar', 'auth', 'api', 'pwa', 'pedido', 'static', 'public',
    'robots', 'sitemap', 'favicon', 'icon', 'manifest', 'marca',
    -- produto
    'admin', 'app', 'www', 'planos', 'precos', 'assinatura', 'assinar', 'termos',
    'privacidade', 'ajuda', 'suporte', 'contato', 'sobre', 'blog', 'status', 'docs',
    'conta', 'minha-conta', 'configuracoes', 'recuperar-senha', 'nova-senha',
    'webhook', 'webhooks', 'kiwify', 'uau', 'uaufoods', 'uau-foods'
  ]);
$$;

alter table public.restaurantes drop constraint restaurantes_slug_check;
alter table public.restaurantes add constraint restaurantes_slug_check check (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and length(slug) between 3 and 60
  and not rest_privado.slug_reservado(slug)
);

-- ---------------------------------------------------------------------------
-- Assinaturas (uma por restaurante). Cobrança externa (provável Kiwify) entra depois,
-- por webhook no servidor; o app só lê.
-- ---------------------------------------------------------------------------

create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null unique references public.restaurantes (id),
  plano text not null default 'completo' check (plano in ('essencial', 'completo')),
  -- cortesia: clientes da fase de testes, sem cobrança.
  status text not null default 'teste' check (status in ('teste', 'ativa', 'atrasada', 'cancelada', 'cortesia')),
  teste_termina_em timestamptz,
  periodo_termina_em timestamptz,
  provedor text check (provedor in ('kiwify')),
  provedor_assinatura_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (status <> 'teste' or teste_termina_em is not null)
);

alter table public.assinaturas enable row level security;

revoke all on public.assinaturas from anon;
revoke all on public.assinaturas from authenticated;
grant select on public.assinaturas to authenticated;

create policy "dono le a assinatura" on public.assinaturas
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create trigger t00_restaurante_fixo before update on public.assinaturas
  for each row execute function rest_privado.restaurante_fixo();

-- Todo restaurante novo começa com 14 dias de teste do plano completo.
create function rest_privado.restaurantes_criar_assinatura()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.assinaturas (restaurante_id, plano, status, teste_termina_em)
  values (new.id, 'completo', 'teste', now() + interval '14 days');
  return new;
end;
$$;

revoke all on function rest_privado.restaurantes_criar_assinatura() from public, anon, authenticated;

create trigger t20_criar_assinatura after insert on public.restaurantes
  for each row execute function rest_privado.restaurantes_criar_assinatura();

-- Restaurantes que já existiam (fase de testes) ficam como cortesia.
insert into public.assinaturas (restaurante_id, plano, status)
select id, 'completo', 'cortesia' from public.restaurantes;

-- ---------------------------------------------------------------------------
-- Cadastro pelo próprio dono
-- ---------------------------------------------------------------------------

-- Endereço livre e válido? (slugs já são públicos pelo site de delivery.)
create function public.slug_disponivel(p_slug text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and length(p_slug) between 3 and 60
    and not rest_privado.slug_reservado(p_slug)
    and not exists (select 1 from public.restaurantes where slug = p_slug);
$$;

revoke all on function public.slug_disponivel(text) from public, anon;
grant execute on function public.slug_disponivel(text) to authenticated;

-- Cria restaurante + dono (usuário logado) numa transação. A assinatura de teste vem do trigger.
create function public.criar_meu_restaurante(
  p_nome text,
  p_slug text,
  p_nome_dono text,
  p_fuso text,
  p_whatsapp text default null,
  p_cor_primaria text default '#111827',
  p_cor_secundaria text default '#f59e0b'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'Entre com a sua conta para cadastrar o restaurante.' using errcode = 'P0001';
  end if;

  -- Limite simples contra abuso do teste grátis.
  if (select count(*) from public.membros where user_id = v_uid and papel = 'dono') >= 3 then
    raise exception 'Limite de restaurantes por conta atingido. Fale com o suporte.' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_nome_dono, ''))) not between 1 and 80 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;

  if rest_privado.slug_reservado(p_slug) then
    raise exception 'Esse endereço é reservado. Escolha outro.' using errcode = 'P0001';
  end if;

  begin
    insert into public.restaurantes (slug, nome, fuso_horario, whatsapp, cor_primaria, cor_secundaria, aceita_delivery)
    values (p_slug, btrim(p_nome), p_fuso, nullif(btrim(p_whatsapp), ''), p_cor_primaria, p_cor_secundaria, false)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esse endereço já está em uso. Escolha outro.' using errcode = 'P0001';
  end;

  insert into public.membros (restaurante_id, user_id, nome, papel)
  values (v_id, v_uid, btrim(p_nome_dono), 'dono');

  return v_id;
end;
$$;

revoke all on function public.criar_meu_restaurante(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.criar_meu_restaurante(text, text, text, text, text, text, text) to authenticated;
