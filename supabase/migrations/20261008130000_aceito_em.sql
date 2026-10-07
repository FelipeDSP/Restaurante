-- Hora em que o caixa aceitou o delivery: o cronômetro da cozinha conta a partir dela
-- (contava desde a criação do pedido e um delivery aceito agora já chegava "atrasado").
alter table public.pedidos add column aceito_em timestamptz;

create or replace function rest_privado.pedidos_transicao()
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
  if old.status = 'recebido' then
    new.aceito_em := now();
  end if;
  return new;
end;
$$;

-- Só o trigger define aceito_em (o app não consegue mudar).
create or replace function rest_privado.pedidos_aceito_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Roda antes de t05_transicao, que define a hora ao aceitar.
  if tg_op = 'INSERT' then
    new.aceito_em := null;
  else
    new.aceito_em := old.aceito_em;
  end if;
  return new;
end;
$$;

create trigger t04_aceito_fixo before insert or update on public.pedidos
  for each row execute function rest_privado.pedidos_aceito_fixo();

revoke all on function rest_privado.pedidos_aceito_fixo() from public, anon, authenticated;
