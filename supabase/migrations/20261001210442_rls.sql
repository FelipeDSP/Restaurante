-- RLS e policies de todas as tabelas, grants por coluna e view pública.
-- Staff: eh_membro / tem_papel. Público (anon): só leitura de cardápio de restaurantes ativos.
-- Nada é apagado nas tabelas de operação: não há policy de delete nelas.

alter table public.restaurantes enable row level security;
alter table public.membros enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.mesas enable row level security;
alter table public.bairros_entrega enable row level security;
alter table public.caixa_sessoes enable row level security;
alter table public.comandas enable row level security;
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;
alter table public.pagamentos enable row level security;

-- ---------------------------------------------------------------------------
-- Grants (defesa em profundidade; a RLS continua decidindo as linhas)
-- ---------------------------------------------------------------------------

revoke all on
  public.restaurantes, public.membros, public.categorias, public.produtos, public.mesas,
  public.bairros_entrega, public.caixa_sessoes, public.comandas, public.pedidos,
  public.itens_pedido, public.pagamentos
from anon;

revoke truncate, references, trigger on
  public.restaurantes, public.membros, public.categorias, public.produtos, public.mesas,
  public.bairros_entrega, public.caixa_sessoes, public.comandas, public.pedidos,
  public.itens_pedido, public.pagamentos
from authenticated;

-- Nada é apagado.
revoke delete on
  public.restaurantes, public.membros, public.caixa_sessoes, public.comandas,
  public.pedidos, public.itens_pedido, public.pagamentos
from authenticated;

-- Restaurantes são criados fora do app (seed / futuro super admin).
revoke insert on public.restaurantes from authenticated;

-- Dono edita só dados e marca; slug, ativo e exclusão ficam fora do app.
revoke update on public.restaurantes from authenticated;
grant update (
  nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco,
  fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min
) on public.restaurantes to authenticated;

-- Membro não muda de usuário.
revoke update on public.membros from authenticated;
grant update (nome, papel, ativo) on public.membros to authenticated;

-- Público: só colunas públicas do restaurante e cardápio.
grant select (
  id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco,
  fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min,
  ativo, excluido_em -- usados no filtro da view restaurantes_publicos
) on public.restaurantes to anon;
grant select on public.categorias, public.produtos, public.bairros_entrega to anon;

-- ---------------------------------------------------------------------------
-- restaurantes
-- ---------------------------------------------------------------------------

create policy "membros leem o proprio restaurante" on public.restaurantes
  for select to authenticated
  using ((select rest_privado.eh_membro(id)));

create policy "publico le restaurantes ativos" on public.restaurantes
  for select to anon, authenticated
  using (ativo and excluido_em is null);

create policy "dono edita o restaurante" on public.restaurantes
  for update to authenticated
  using ((select rest_privado.tem_papel(id, array['dono'])))
  with check ((select rest_privado.tem_papel(id, array['dono'])));

create view public.restaurantes_publicos
with (security_invoker = true)
as
select
  id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco,
  fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min
from public.restaurantes
where ativo and excluido_em is null;

revoke all on public.restaurantes_publicos from anon, authenticated;
grant select on public.restaurantes_publicos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- membros
-- ---------------------------------------------------------------------------

create policy "usuario le seus vinculos e membros leem a equipe" on public.membros
  for select to authenticated
  using (user_id = (select auth.uid()) or (select rest_privado.eh_membro(restaurante_id)));

create policy "dono adiciona membros" on public.membros
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "dono edita membros" on public.membros
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

-- ---------------------------------------------------------------------------
-- Cadastros: membros leem, dono escreve, público lê o que está ativo
-- ---------------------------------------------------------------------------

create policy "membros leem categorias" on public.categorias
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "publico le categorias ativas" on public.categorias
  for select to anon, authenticated
  using (ativa and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "dono cria categorias" on public.categorias
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita categorias" on public.categorias
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga categorias" on public.categorias
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "membros leem produtos" on public.produtos
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "publico le produtos do delivery" on public.produtos
  for select to anon, authenticated
  using (disponivel and disponivel_delivery and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "dono cria produtos" on public.produtos
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita produtos" on public.produtos
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga produtos" on public.produtos
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "membros leem mesas" on public.mesas
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "dono cria mesas" on public.mesas
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita mesas" on public.mesas
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga mesas" on public.mesas
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "membros leem bairros" on public.bairros_entrega
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "publico le bairros ativos" on public.bairros_entrega
  for select to anon, authenticated
  using (ativo and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "dono cria bairros" on public.bairros_entrega
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita bairros" on public.bairros_entrega
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga bairros" on public.bairros_entrega
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

-- ---------------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------------

create policy "membros leem sessoes de caixa" on public.caixa_sessoes
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "caixa e dono abrem o caixa" on public.caixa_sessoes
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
create policy "caixa e dono fecham o caixa" on public.caixa_sessoes
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));

create policy "membros leem comandas" on public.comandas
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "membros abrem comandas" on public.comandas
  for insert to authenticated
  with check ((select rest_privado.eh_membro(restaurante_id)));
create policy "membros atualizam comandas" on public.comandas
  for update to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)))
  with check ((select rest_privado.eh_membro(restaurante_id)));

create policy "membros leem pedidos" on public.pedidos
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
-- Delivery só pela RPC criar_pedido_delivery.
create policy "membros lancam pedidos de mesa e balcao" on public.pedidos
  for insert to authenticated
  with check (origem <> 'delivery' and (select rest_privado.eh_membro(restaurante_id)));
create policy "membros atualizam pedidos" on public.pedidos
  for update to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)))
  with check ((select rest_privado.eh_membro(restaurante_id)));

create policy "membros leem itens" on public.itens_pedido
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "membros lancam itens" on public.itens_pedido
  for insert to authenticated
  with check ((select rest_privado.eh_membro(restaurante_id)));
create policy "membros editam e cancelam itens" on public.itens_pedido
  for update to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)))
  with check ((select rest_privado.eh_membro(restaurante_id)));

create policy "membros leem pagamentos" on public.pagamentos
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "membros registram pagamentos" on public.pagamentos
  for insert to authenticated
  with check ((select rest_privado.eh_membro(restaurante_id)));
create policy "caixa e dono estornam pagamentos" on public.pagamentos
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
