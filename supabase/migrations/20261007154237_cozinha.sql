-- Cozinha (fase 1 da impressão): praças de produção, praça de cada produto e uma
-- tarefa por pedido e praça (o "ticket" da praça). A tela da cozinha lê as tarefas;
-- a impressão (fases 2 e 3) vai partir delas também.

-- ---------------------------------------------------------------------------
-- Papel "cozinha": acessa só a tela da cozinha
-- ---------------------------------------------------------------------------

alter table public.membros drop constraint membros_papel_check;
alter table public.membros add constraint membros_papel_check
  check (papel in ('dono', 'caixa', 'garcom', 'cozinha'));

-- ---------------------------------------------------------------------------
-- Praças
-- ---------------------------------------------------------------------------

create table public.estacoes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  ordem integer not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nome)
);
create index estacoes_restaurante_ordem_idx on public.estacoes (restaurante_id, ordem);

create trigger t00_restaurante_fixo before update on public.estacoes
  for each row execute function rest_privado.restaurante_fixo();

-- Para onde o produto vai; vazio = não passa pela cozinha (ex.: refrigerante).
alter table public.produtos add column estacao_id uuid;
alter table public.produtos add constraint produtos_restaurante_id_estacao_id_fkey
  foreign key (restaurante_id, estacao_id) references public.estacoes (restaurante_id, id)
  on delete set null (estacao_id);
create index produtos_restaurante_estacao_idx on public.produtos (restaurante_id, estacao_id);

-- Praça congelada no item, como o preço: mudar o cadastro depois não muda pedidos já feitos.
alter table public.itens_pedido add column estacao_id uuid;
alter table public.itens_pedido add constraint itens_pedido_restaurante_id_estacao_id_fkey
  foreign key (restaurante_id, estacao_id) references public.estacoes (restaurante_id, id)
  on delete set null (estacao_id);
create index itens_pedido_restaurante_estacao_idx on public.itens_pedido (restaurante_id, estacao_id);

-- ---------------------------------------------------------------------------
-- Tarefas de produção: uma por pedido e praça
-- ---------------------------------------------------------------------------

create table public.tarefas_producao (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  pedido_id uuid not null,
  estacao_id uuid not null,
  status text not null default 'pendente' check (status in ('pendente', 'pronto')),
  criado_em timestamptz not null default now(),
  pronto_em timestamptz,
  pronto_por uuid,
  unique (restaurante_id, pedido_id, estacao_id),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, estacao_id) references public.estacoes (restaurante_id, id),
  foreign key (restaurante_id, pronto_por) references public.membros (restaurante_id, id)
);
create index tarefas_producao_restaurante_status_idx on public.tarefas_producao (restaurante_id, status, criado_em);
create index tarefas_producao_restaurante_estacao_idx on public.tarefas_producao (restaurante_id, estacao_id);
create index tarefas_producao_restaurante_pronto_por_idx on public.tarefas_producao (restaurante_id, pronto_por);

create trigger t00_restaurante_fixo before update on public.tarefas_producao
  for each row execute function rest_privado.restaurante_fixo();

-- Só a situação muda; quem e quando marcou pronto vem do banco.
create function rest_privado.tarefas_producao_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.pedido_id := old.pedido_id;
  new.estacao_id := old.estacao_id;
  new.criado_em := old.criado_em;
  if new.status = 'pronto' and old.status <> 'pronto' then
    new.pronto_em := now();
    new.pronto_por := rest_privado.membro_atual(new.restaurante_id);
  elsif new.status = 'pendente' then
    new.pronto_em := null;
    new.pronto_por := null;
  else
    new.pronto_em := old.pronto_em;
    new.pronto_por := old.pronto_por;
  end if;
  return new;
end;
$$;

create trigger t10_antes_atualizar before update on public.tarefas_producao
  for each row execute function rest_privado.tarefas_producao_antes_atualizar();

-- Delivery: quando todas as praças terminam, o pedido passa para "pronto" sozinho.
create function rest_privado.tarefas_producao_depois_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'pronto' and old.status <> 'pronto'
     and not exists (
       select 1 from public.tarefas_producao
       where pedido_id = new.pedido_id and status = 'pendente'
     ) then
    update public.pedidos set status = 'pronto'
    where id = new.pedido_id and origem = 'delivery' and status = 'em_preparo';
  end if;
  return null;
end;
$$;

create trigger t20_depois_atualizar after update on public.tarefas_producao
  for each row execute function rest_privado.tarefas_producao_depois_atualizar();

revoke all on function rest_privado.tarefas_producao_antes_atualizar() from public, anon, authenticated;
revoke all on function rest_privado.tarefas_producao_depois_atualizar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- itens_pedido: praça do produto + tarefa da praça
-- ---------------------------------------------------------------------------

create or replace function rest_privado.itens_pedido_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_preco integer;
  v_disponivel boolean;
  v_estacao_id uuid;
  v_status_pedido text;
  v_comanda_id uuid;
  v_status_comanda text;
  v_adicionais jsonb;
begin
  select p.nome, p.preco, p.disponivel, e.id
  into v_nome, v_preco, v_disponivel, v_estacao_id
  from public.produtos p
  left join public.estacoes e on e.id = p.estacao_id and e.restaurante_id = p.restaurante_id and e.ativa
  where p.id = new.produto_id and p.restaurante_id = new.restaurante_id;

  if v_nome is null then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;
  if not v_disponivel then
    raise exception 'Produto indisponível: %.', v_nome using errcode = 'P0001';
  end if;

  select status, comanda_id into v_status_pedido, v_comanda_id
  from public.pedidos
  where id = new.pedido_id and restaurante_id = new.restaurante_id;

  if v_status_pedido is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_status_pedido = 'cancelado' then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;
  if v_comanda_id is not null then
    select status into v_status_comanda from public.comandas where id = v_comanda_id;
    if v_status_comanda not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
  end if;

  -- Opções: o cliente manda só os ids; nome e preço vêm do cadastro.
  v_adicionais := rest_privado.montar_adicionais(new.restaurante_id, new.produto_id, new.adicionais);

  -- Preço e praça congelados: sempre do cadastro, nunca do cliente.
  new.nome_produto := v_nome;
  new.preco_unitario := v_preco;
  new.estacao_id := v_estacao_id;
  new.adicionais := v_adicionais -> 'itens';
  new.preco_adicionais := (v_adicionais ->> 'total')::integer;
  new.total := (v_preco + new.preco_adicionais) * new.quantidade;
  new.criado_em := now();
  new.cancelado_em := null;
  new.cancelado_por := null;
  new.motivo_cancelamento := null;
  return new;
end;
$$;

create or replace function rest_privado.itens_pedido_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is not null then
    raise exception 'Item já cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and status = 'cancelado') then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;

  -- Para trocar as opções, cancela o item e lança de novo.
  new.pedido_id := old.pedido_id;
  new.produto_id := old.produto_id;
  new.nome_produto := old.nome_produto;
  new.preco_unitario := old.preco_unitario;
  new.estacao_id := old.estacao_id;
  new.adicionais := old.adicionais;
  new.preco_adicionais := old.preco_adicionais;
  new.criado_em := old.criado_em;

  if new.cancelado_em is not null then
    if coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_em := now();
    new.cancelado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.cancelado_por := null;
    new.motivo_cancelamento := null;
  end if;

  new.total := (new.preco_unitario + new.preco_adicionais) * new.quantidade;
  return new;
end;
$$;

-- Item novo numa praça: abre (ou reabre) a tarefa daquela praça no pedido.
create function rest_privado.itens_pedido_criar_tarefa()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.estacao_id is not null then
    insert into public.tarefas_producao (restaurante_id, pedido_id, estacao_id)
    values (new.restaurante_id, new.pedido_id, new.estacao_id)
    on conflict (restaurante_id, pedido_id, estacao_id) do update
      set status = 'pendente'
      where public.tarefas_producao.status = 'pronto';
  end if;
  return null;
end;
$$;

revoke all on function rest_privado.itens_pedido_criar_tarefa() from public, anon, authenticated;

create trigger t30_criar_tarefa after insert on public.itens_pedido
  for each row execute function rest_privado.itens_pedido_criar_tarefa();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.estacoes enable row level security;
alter table public.tarefas_producao enable row level security;

revoke all on public.estacoes, public.tarefas_producao from anon;
revoke truncate, references, trigger on public.estacoes, public.tarefas_producao from authenticated;

-- Tarefas nascem só pelo trigger; a equipe só muda a situação.
revoke insert, update, delete on public.tarefas_producao from authenticated;
grant update (status) on public.tarefas_producao to authenticated;

create policy "membros leem pracas" on public.estacoes
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "dono cria pracas" on public.estacoes
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita pracas" on public.estacoes
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga pracas" on public.estacoes
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "membros leem tarefas" on public.tarefas_producao
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "membros marcam tarefas" on public.tarefas_producao
  for update to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)))
  with check ((select rest_privado.eh_membro(restaurante_id)));

-- Tela da cozinha em tempo real.
alter publication supabase_realtime add table public.tarefas_producao;

-- ---------------------------------------------------------------------------
-- /cozinha passa a ser rota do app: endereço reservado
-- ---------------------------------------------------------------------------

create or replace function rest_privado.slug_reservado(p_slug text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_slug = any (array[
    -- app
    'login', 'entrar', 'sair', 'painel', 'garcom', 'cozinha', 'inicio', 'selecionar', 'sem-acesso',
    'cadastro', 'comecar', 'auth', 'api', 'pwa', 'pedido', 'static', 'public',
    'robots', 'sitemap', 'favicon', 'icon', 'manifest', 'marca',
    -- produto
    'admin', 'app', 'www', 'planos', 'precos', 'assinatura', 'assinar', 'termos',
    'privacidade', 'ajuda', 'suporte', 'contato', 'sobre', 'blog', 'status', 'docs',
    'conta', 'minha-conta', 'configuracoes', 'recuperar-senha', 'nova-senha',
    'webhook', 'webhooks', 'kiwify', 'uau', 'uaufoods', 'uau-foods'
  ]);
$$;
