-- Conta encerrada não muda mais (pedido do cliente em 04/11: "o cliente poderia alegar que o
-- restaurante editou o pedido depois"). O banco já recusava lançar, cancelar, estornar e reabrir;
-- aqui fecham as brechas que sobravam. O estorno de um delivery entregue continua possível (é uma
-- devolução de dinheiro real), registrado com quem, quando e o motivo, sem mudar o pedido.

-- Comanda fechada ou cancelada: nada da conta muda (pessoas, serviço, couvert, garçom, valores).
create or replace function rest_privado.comandas_encerrada_fixa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('fechada', 'cancelada') and (
       new.status, new.pessoas, new.cobrar_servico, new.cobrar_couvert, new.garcom_id, new.mesa_id,
       new.servico_percentual, new.couvert_unitario, new.subtotal, new.servico, new.couvert, new.total,
       new.aberta_em, new.fechada_em, new.fechada_por, new.caixa_sessao_id
     ) is distinct from (
       old.status, old.pessoas, old.cobrar_servico, old.cobrar_couvert, old.garcom_id, old.mesa_id,
       old.servico_percentual, old.couvert_unitario, old.subtotal, old.servico, old.couvert, old.total,
       old.aberta_em, old.fechada_em, old.fechada_por, old.caixa_sessao_id
     ) then
    raise exception 'Conta encerrada: não pode mais ser alterada.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger t01_encerrada_fixa before update on public.comandas
for each row execute function rest_privado.comandas_encerrada_fixa();

-- Itens de uma comanda encerrada: nenhum campo muda (observação, quantidade, entregue...).
create or replace function rest_privado.itens_comanda_encerrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.pedidos p join public.comandas c on c.id = p.comanda_id
    where p.id = old.pedido_id and c.status in ('fechada', 'cancelada')
  ) and row(new.*) is distinct from row(old.*) then
    raise exception 'Conta encerrada: os itens não podem mais ser alterados.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger t01_comanda_encerrada before update on public.itens_pedido
for each row execute function rest_privado.itens_comanda_encerrada();

-- Pedido terminado: delivery entregue/cancelado não muda de situação nem de entregador; pedido de uma
-- comanda encerrada não é cancelado nem muda de valor.
create or replace function rest_privado.pedidos_finalizado_fixo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.origem = 'delivery' and old.status in ('entregue', 'cancelado') and (
       new.status, new.entregador_id, new.valor_entregador, new.subtotal, new.desconto, new.total, new.cancelado_em
     ) is distinct from (
       old.status, old.entregador_id, old.valor_entregador, old.subtotal, old.desconto, old.total, old.cancelado_em
     ) then
    raise exception 'Pedido finalizado: não pode mais ser alterado.' using errcode = 'P0001';
  end if;
  if old.comanda_id is not null
     and exists (select 1 from public.comandas c where c.id = old.comanda_id and c.status in ('fechada', 'cancelada'))
     and (new.status, new.subtotal, new.total, new.cancelado_em) is distinct from (old.status, old.subtotal, old.total, old.cancelado_em) then
    raise exception 'Conta encerrada: o pedido não pode mais ser alterado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger t01_finalizado_fixo before update on public.pedidos
for each row execute function rest_privado.pedidos_finalizado_fixo();

revoke all on function rest_privado.comandas_encerrada_fixa() from public, anon, authenticated;
revoke all on function rest_privado.itens_comanda_encerrada() from public, anon, authenticated;
revoke all on function rest_privado.pedidos_finalizado_fixo() from public, anon, authenticated;
