-- Apelido do endereço salvo ("Casa", "Trabalho"), pedido do dono em 27/11 olhando o iFood.
--
-- Duas linhas de rua parecidas não se distinguem de relance no checkout; um nome resolve. O
-- apelido é só rótulo: não entra no pedido nem muda taxa, e o endereço continua nascendo do
-- pedido (o trigger `pedidos_guardar_endereco`), então quem nomeia é o cliente, em Minha conta.

alter table public.clientes_enderecos
  add column apelido text check (apelido is null or length(btrim(apelido)) between 1 and 30);

-- O cliente muda só o apelido do próprio endereço. Rua, número e bairro continuam vindo do
-- pedido: deixar editar aqui faria o endereço do pedido e o salvo contarem histórias diferentes.
grant update (apelido) on public.clientes_enderecos to authenticated;

create policy "cliente apelida os próprios endereços" on public.clientes_enderecos
  for update to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = (select auth.uid())));

-- O apelido não se perde quando o cliente pede de novo no mesmo endereço (o trigger faz
-- `on conflict do update`, e a coluna fica de fora da lista — nada a fazer aqui além de
-- registrar a intenção, já que o update não a menciona).
