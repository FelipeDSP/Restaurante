-- Estrutura base do MVP: tabelas, constraints e índices.
-- Regras: PK uuid, restaurante_id em toda tabela de restaurante, dinheiro em centavos,
-- nada é apagado (cancelamento/estorno/desativação), índices começando por restaurante_id.
-- FKs compostas (restaurante_id, x_id) impedem referência cruzada entre restaurantes.

-- Esquema privado para funções auxiliares (não exposto pela API).
create schema if not exists rest_privado;
grant usage on schema rest_privado to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Global
-- ---------------------------------------------------------------------------

create table public.restaurantes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(slug) between 3 and 60
      and slug not in ('login', 'painel', 'garcom', 'api', 'admin', 'app', 'www', 'pedido', 'static', 'public')
    ),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  logo_url text,
  cor_primaria text not null default '#111827' check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  cor_secundaria text not null default '#f59e0b' check (cor_secundaria ~ '^#[0-9a-fA-F]{6}$'),
  telefone text,
  whatsapp text,
  endereco jsonb not null default '{}'::jsonb,
  fuso_horario text not null default 'America/Porto_Velho',
  -- {"dom": [{"abre": "18:00", "fecha": "02:00"}], "seg": [...], ...}; "fecha" <= "abre" cruza a meia-noite.
  horarios jsonb not null default '{}'::jsonb,
  aceita_delivery boolean not null default false,
  pedido_minimo integer not null default 0 check (pedido_minimo >= 0),
  tempo_estimado_entrega_min integer check (tempo_estimado_entrega_min > 0),
  ativo boolean not null default true,
  excluido_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.membros (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  user_id uuid not null references auth.users (id),
  nome text not null check (length(btrim(nome)) between 1 and 120),
  papel text not null check (papel in ('dono', 'caixa', 'garcom')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, user_id),
  unique (restaurante_id, id)
);
create index membros_user_id_idx on public.membros (user_id);

-- ---------------------------------------------------------------------------
-- Cadastros por restaurante
-- ---------------------------------------------------------------------------

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  ordem integer not null default 0,
  ativa boolean not null default true,
  unique (restaurante_id, id)
);
create index categorias_restaurante_ordem_idx on public.categorias (restaurante_id, ordem);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  categoria_id uuid not null,
  nome text not null check (length(btrim(nome)) between 1 and 120),
  descricao text check (length(descricao) <= 500),
  preco integer not null check (preco >= 0),
  foto_url text,
  disponivel boolean not null default true,
  disponivel_delivery boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  foreign key (restaurante_id, categoria_id) references public.categorias (restaurante_id, id)
);
create index produtos_restaurante_categoria_idx on public.produtos (restaurante_id, categoria_id, ordem);

create table public.mesas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  numero text not null check (length(btrim(numero)) between 1 and 30),
  ativa boolean not null default true,
  ordem integer not null default 0,
  unique (restaurante_id, numero),
  unique (restaurante_id, id)
);
create index mesas_restaurante_ordem_idx on public.mesas (restaurante_id, ordem);

create table public.bairros_entrega (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  taxa integer not null default 0 check (taxa >= 0),
  ativo boolean not null default true,
  unique (restaurante_id, nome),
  unique (restaurante_id, id)
);

-- ---------------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------------

create table public.caixa_sessoes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  aberta_por uuid not null,
  aberta_em timestamptz not null default now(),
  valor_inicial integer not null default 0 check (valor_inicial >= 0),
  fechada_por uuid,
  fechada_em timestamptz,
  valor_contado integer check (valor_contado >= 0),
  observacao text check (length(observacao) <= 500),
  -- Contador do número amigável dos pedidos desta sessão.
  ultimo_numero_pedido integer not null default 0,
  unique (restaurante_id, id),
  foreign key (restaurante_id, aberta_por) references public.membros (restaurante_id, id),
  foreign key (restaurante_id, fechada_por) references public.membros (restaurante_id, id),
  check ((fechada_em is null) = (fechada_por is null)),
  check (fechada_em is null or valor_contado is not null)
);
-- No máximo uma sessão aberta por restaurante.
create unique index caixa_sessoes_uma_aberta_idx on public.caixa_sessoes (restaurante_id) where fechada_em is null;
create index caixa_sessoes_restaurante_aberta_em_idx on public.caixa_sessoes (restaurante_id, aberta_em desc);

create table public.comandas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  mesa_id uuid not null,
  garcom_id uuid,
  caixa_sessao_id uuid not null,
  status text not null default 'aberta' check (status in ('aberta', 'conta_pedida', 'fechada', 'cancelada')),
  pessoas integer check (pessoas between 1 and 100),
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  fechada_por uuid,
  total integer not null default 0 check (total >= 0),
  unique (restaurante_id, id),
  foreign key (restaurante_id, mesa_id) references public.mesas (restaurante_id, id),
  foreign key (restaurante_id, garcom_id) references public.membros (restaurante_id, id),
  foreign key (restaurante_id, caixa_sessao_id) references public.caixa_sessoes (restaurante_id, id),
  foreign key (restaurante_id, fechada_por) references public.membros (restaurante_id, id),
  check ((status in ('fechada', 'cancelada')) = (fechada_em is not null))
);
-- Só uma comanda aberta por mesa.
create unique index comandas_uma_aberta_por_mesa_idx on public.comandas (restaurante_id, mesa_id)
  where status in ('aberta', 'conta_pedida');
create index comandas_restaurante_status_idx on public.comandas (restaurante_id, status);
create index comandas_restaurante_sessao_idx on public.comandas (restaurante_id, caixa_sessao_id);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  numero integer not null,
  origem text not null check (origem in ('mesa', 'delivery', 'balcao')),
  comanda_id uuid,
  caixa_sessao_id uuid not null,
  status text not null default 'recebido'
    check (status in ('recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'entregue', 'cancelado')),
  cliente_nome text check (length(cliente_nome) <= 120),
  cliente_telefone text check (length(cliente_telefone) <= 30),
  endereco jsonb,
  bairro_id uuid,
  taxa_entrega integer not null default 0 check (taxa_entrega >= 0),
  forma_pagamento_prevista text check (forma_pagamento_prevista in ('dinheiro', 'pix', 'credito', 'debito', 'outro')),
  troco_para integer check (troco_para >= 0),
  observacao text check (length(observacao) <= 500),
  subtotal integer not null default 0 check (subtotal >= 0),
  total integer not null default 0 check (total >= 0),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text check (length(motivo_cancelamento) <= 500),
  unique (restaurante_id, id),
  unique (restaurante_id, caixa_sessao_id, numero),
  foreign key (restaurante_id, comanda_id) references public.comandas (restaurante_id, id),
  foreign key (restaurante_id, caixa_sessao_id) references public.caixa_sessoes (restaurante_id, id),
  foreign key (restaurante_id, bairro_id) references public.bairros_entrega (restaurante_id, id),
  foreign key (restaurante_id, criado_por) references public.membros (restaurante_id, id),
  foreign key (restaurante_id, cancelado_por) references public.membros (restaurante_id, id),
  check ((origem = 'mesa') = (comanda_id is not null)),
  check (origem <> 'delivery' or (cliente_nome is not null and cliente_telefone is not null and bairro_id is not null)),
  check ((status = 'cancelado') = (cancelado_em is not null)),
  check (cancelado_em is null or motivo_cancelamento is not null)
);
create index pedidos_restaurante_origem_status_idx on public.pedidos (restaurante_id, origem, status);
create index pedidos_restaurante_comanda_idx on public.pedidos (restaurante_id, comanda_id);
create index pedidos_restaurante_criado_em_idx on public.pedidos (restaurante_id, criado_em desc);

create table public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  pedido_id uuid not null,
  produto_id uuid not null,
  -- Congelados no lançamento (preenchidos pelo banco).
  nome_produto text not null,
  preco_unitario integer not null check (preco_unitario >= 0),
  quantidade integer not null check (quantidade between 1 and 999),
  observacao text check (length(observacao) <= 300),
  total integer not null default 0 check (total >= 0),
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text check (length(motivo_cancelamento) <= 500),
  unique (restaurante_id, id),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, produto_id) references public.produtos (restaurante_id, id),
  foreign key (restaurante_id, cancelado_por) references public.membros (restaurante_id, id),
  check (cancelado_em is null or motivo_cancelamento is not null)
);
create index itens_pedido_restaurante_pedido_idx on public.itens_pedido (restaurante_id, pedido_id);
create index itens_pedido_restaurante_produto_idx on public.itens_pedido (restaurante_id, produto_id);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  comanda_id uuid,
  pedido_id uuid,
  caixa_sessao_id uuid not null,
  valor integer not null check (valor > 0),
  forma text not null check (forma in ('dinheiro', 'pix', 'credito', 'debito', 'outro')),
  registrado_por uuid not null,
  criado_em timestamptz not null default now(),
  estornado_em timestamptz,
  estornado_por uuid,
  unique (restaurante_id, id),
  foreign key (restaurante_id, comanda_id) references public.comandas (restaurante_id, id),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, caixa_sessao_id) references public.caixa_sessoes (restaurante_id, id),
  foreign key (restaurante_id, registrado_por) references public.membros (restaurante_id, id),
  foreign key (restaurante_id, estornado_por) references public.membros (restaurante_id, id),
  check (num_nonnulls(comanda_id, pedido_id) = 1),
  check ((estornado_em is null) = (estornado_por is null))
);
create index pagamentos_restaurante_comanda_idx on public.pagamentos (restaurante_id, comanda_id);
create index pagamentos_restaurante_pedido_idx on public.pagamentos (restaurante_id, pedido_id);
create index pagamentos_restaurante_sessao_idx on public.pagamentos (restaurante_id, caixa_sessao_id);
