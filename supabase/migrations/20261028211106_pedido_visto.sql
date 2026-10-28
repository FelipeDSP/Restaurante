-- Pedido do cliente pelo QR code: o garçom precisa ver (pedido do cliente em 28/10: "se o cliente pede
-- bebida o garçom vai lá perguntar se é para agora"). O aviso no app insiste até alguém tocar em
-- "Ver pedido"; aí o banco guarda quem viu e quando, e o aviso para nos outros aparelhos.

alter table public.pedidos
  add column visto_em timestamptz,
  add column visto_por uuid,
  add foreign key (restaurante_id, visto_por) references public.membros (restaurante_id, id);

create index pedidos_restaurante_visto_por on public.pedidos (restaurante_id, visto_por) where visto_por is not null;

-- Só o pedido feito pelo cliente na mesa (origem mesa, sem autor da equipe); só a primeira vez conta.
create or replace function public.marcar_pedido_visto(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  select restaurante_id into v_restaurante_id
  from public.pedidos
  where id = p_pedido_id and origem = 'mesa' and criado_por is null;
  if v_restaurante_id is null or not rest_privado.eh_membro(v_restaurante_id) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  perform set_config('rest.marcar_visto', 'sim', true);
  update public.pedidos
  set visto_em = now(), visto_por = rest_privado.membro_atual(v_restaurante_id)
  where id = p_pedido_id and visto_em is null;
  perform set_config('rest.marcar_visto', '', true);
end;
$$;

revoke execute on function public.marcar_pedido_visto(uuid) from public, anon;
grant execute on function public.marcar_pedido_visto(uuid) to authenticated;

-- Quem viu e quando vêm só da função (nem a edição nem um update direto mexem).
create or replace function rest_privado.pedidos_visto_fixo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.visto_em := null;
    new.visto_por := null;
  elsif (new.visto_em, new.visto_por) is distinct from (old.visto_em, old.visto_por)
        and (old.visto_em is not null or current_setting('rest.marcar_visto', true) is distinct from 'sim') then
    new.visto_em := old.visto_em;
    new.visto_por := old.visto_por;
  end if;
  return new;
end;
$$;

create trigger t02_visto_fixo
before insert or update on public.pedidos
for each row execute function rest_privado.pedidos_visto_fixo();
