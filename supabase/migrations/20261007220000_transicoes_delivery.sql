-- Delivery: o status só anda para frente e não pula o aceite; ao sair da cozinha
-- (pronto, saiu para entrega, entregue), os tickets pendentes das praças são encerrados
-- (antes ficavam "pendentes" para sempre na tela da cozinha quando o caixa adiantava o pedido).

create function rest_privado.ordem_status_delivery(p_status text)
returns integer
language sql immutable
set search_path = ''
as $$
  select case p_status
    when 'recebido' then 0
    when 'em_preparo' then 1
    when 'pronto' then 2
    when 'saiu_entrega' then 3
    when 'entregue' then 4
  end;
$$;

create function rest_privado.pedidos_transicao()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome jsonb := '{"recebido": "recebido", "em_preparo": "em preparo", "pronto": "pronto", "saiu_entrega": "saiu para entrega", "entregue": "entregue"}';
begin
  if old.origem <> 'delivery' or new.status = old.status or new.status = 'cancelado' or old.status = 'cancelado' then
    return new; -- cancelamento tem as regras próprias em t10_antes_atualizar
  end if;
  if old.status = 'entregue' then
    raise exception 'Pedido já entregue.' using errcode = 'P0001';
  end if;
  if old.status = 'recebido' and new.status <> 'em_preparo' then
    raise exception 'Aceite o pedido antes de marcá-lo como %.', v_nome ->> new.status using errcode = 'P0001';
  end if;
  if rest_privado.ordem_status_delivery(new.status) < rest_privado.ordem_status_delivery(old.status) then
    raise exception 'O pedido não pode voltar de "%" para "%".', v_nome ->> old.status, v_nome ->> new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger t05_transicao before update of status on public.pedidos
  for each row execute function rest_privado.pedidos_transicao();

create function rest_privado.pedidos_encerrar_tarefas()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.origem = 'delivery'
     and new.status in ('pronto', 'saiu_entrega', 'entregue')
     and old.status is distinct from new.status then
    update public.tarefas_producao set status = 'pronto'
    where pedido_id = new.id and status = 'pendente';
  end if;
  return null;
end;
$$;

create trigger t25_encerrar_tarefas after update of status on public.pedidos
  for each row execute function rest_privado.pedidos_encerrar_tarefas();

revoke all on function rest_privado.ordem_status_delivery(text) from public, anon, authenticated;
revoke all on function rest_privado.pedidos_transicao() from public, anon, authenticated;
revoke all on function rest_privado.pedidos_encerrar_tarefas() from public, anon, authenticated;
