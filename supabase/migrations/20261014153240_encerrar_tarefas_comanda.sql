-- Comanda fechada (ou cancelada) encerra os tickets de praça que ainda estavam pendentes.
-- Sem isso, quando ninguém marca "pronto" (cozinha sem tela), o ticket ficava para sempre na
-- tela da cozinha e na aba Praças do garçom. O delivery já faz o mesmo ao ficar pronto/sair/entregar.

create function rest_privado.comandas_encerrar_tarefas()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status in ('fechada', 'cancelada') and old.status is distinct from new.status then
    update public.tarefas_producao t set status = 'pronto'
    from public.pedidos p
    where p.id = t.pedido_id
      and p.restaurante_id = new.restaurante_id
      and p.comanda_id = new.id
      and t.status = 'pendente';
  end if;
  return null;
end;
$$;

create trigger t25_encerrar_tarefas after update of status on public.comandas
  for each row execute function rest_privado.comandas_encerrar_tarefas();

revoke all on function rest_privado.comandas_encerrar_tarefas() from public, anon, authenticated;

-- Limpeza única: tickets que ficaram pendentes de comandas já fechadas/canceladas
-- e de pedidos já cancelados ou finalizados.
update public.tarefas_producao t set status = 'pronto'
from public.pedidos p
left join public.comandas c on c.id = p.comanda_id
where p.id = t.pedido_id
  and t.status = 'pendente'
  and (p.status in ('cancelado', 'pronto', 'saiu_entrega', 'entregue') or c.status in ('fechada', 'cancelada'));
