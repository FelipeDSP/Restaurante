-- Entregue na mesa: "Retirei" na aba Praças (o garçom já está com o prato na mão) ou "Entreguei" no
-- pedido pronto da comanda. Pedido entregue não fica com o selo "Pronto" na mesa nem gera o aviso
-- "pode levar"; na comanda aparece "Entregue". A tela da cozinha continua marcando só "pronto".

alter table public.tarefas_producao add column retirada boolean not null default false;

grant update (retirada) on public.tarefas_producao to authenticated;

-- Só ticket pronto é entregue; entregue não "desentrega" (só voltando para preparo, no "Desfazer").
create function rest_privado.tarefas_producao_retirada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pronto' then
    new.retirada := (old.status = 'pronto' and old.retirada) or coalesce(new.retirada, false);
  else
    new.retirada := false;
  end if;
  return new;
end;
$$;

create trigger t11_retirada before update on public.tarefas_producao
  for each row execute function rest_privado.tarefas_producao_retirada();

revoke all on function rest_privado.tarefas_producao_retirada() from public, anon, authenticated;
