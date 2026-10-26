-- Avisos no celular do cliente do delivery (Web Push, sem serviço de terceiros).
-- Cada linha é um aparelho que pediu para ser avisado de um pedido. Quem grava e lê é só o
-- servidor (chave secreta), depois de conferir o pedido: o navegador do cliente é anônimo.
-- Some quando o pedido termina (entregue ou cancelado) ou quando o navegador recusa o aviso.
create table public.pedidos_avisos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  pedido_id uuid not null,
  endpoint text not null check (length(endpoint) between 20 and 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  criado_em timestamptz not null default now(),
  unique (pedido_id, endpoint),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id) on delete cascade
);

create index pedidos_avisos_restaurante_pedido on public.pedidos_avisos (restaurante_id, pedido_id);

alter table public.pedidos_avisos enable row level security;
revoke all on public.pedidos_avisos from anon, authenticated;

-- Ninguém da API lê nem escreve (só a chave secreta, que ignora a RLS); a policy existe para a
-- regra "nenhuma tabela sem policy" e não libera nada.
create policy pedidos_avisos_sem_acesso on public.pedidos_avisos
  for select to authenticated
  using (false);
