-- Avisos no celular da equipe (Web Push), com o app fechado.
--
-- Hoje a equipe só é avisada enquanto a tela está aberta na frente da pessoa: o bipe e a vibração
-- são da página, e o navegador ignora os dois quando ela está escondida. Guardou o celular no
-- bolso, o chamado do caixa simplesmente não chega. Isto é a mesma encanação que já avisa o
-- cliente do delivery (`pedidos_avisos`), agora para quem trabalha.
--
-- Uma linha por aparelho em que a pessoa ligou os avisos — o garçom costuma ter o celular e um
-- tablet, e os dois devem tocar. Quem grava e lê é só o servidor com a chave secreta, depois de
-- resolver o membro pela sessão: o navegador nunca diz de quem é a inscrição.
create table public.membros_avisos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  membro_id uuid not null,
  endpoint text not null check (length(endpoint) between 20 and 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  criado_em timestamptz not null default now(),
  unique (membro_id, endpoint),
  -- Tirou a pessoa da equipe, somem os avisos dela.
  foreign key (restaurante_id, membro_id) references public.membros (restaurante_id, id) on delete cascade
);

create index membros_avisos_membro on public.membros_avisos (membro_id);

alter table public.membros_avisos enable row level security;
revoke all on public.membros_avisos from anon, authenticated;

-- Ninguém da API lê nem escreve (só a chave secreta, que ignora a RLS). A policy existe para a
-- regra "nenhuma tabela sem policy" e não libera nada: o endereço de push de um aparelho é dado
-- de aparelho, não precisa estar ao alcance de mais ninguém.
create policy membros_avisos_sem_acesso on public.membros_avisos
  for select to authenticated
  using (false);
