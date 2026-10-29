-- Via do cliente ao fechar a mesa (pedido do cliente em 29/10): a impressora marcada imprime a
-- conta sozinha quando a comanda é fechada, para o cliente ver quanto gastou em cada coisa.
-- Usa o mesmo trabalho "conta" da fila; com a comanda fechada o papel sai como conta paga.

alter table public.impressoras add column imprime_ao_fechar boolean not null default false;

create or replace function rest_privado.comandas_via_ao_fechar()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.status = 'fechada' and old.status is distinct from 'fechada' then
    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, comanda_id)
    select new.restaurante_id, i.id, 'conta', new.id
    from public.impressoras i
    where i.restaurante_id = new.restaurante_id and i.ativa and i.imprime_ao_fechar;
  end if;
  return null;
end;
$function$;

create trigger t26_via_ao_fechar
after update of status on public.comandas
for each row execute function rest_privado.comandas_via_ao_fechar();
