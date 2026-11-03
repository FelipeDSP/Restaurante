-- Conversa entre o cliente do delivery e o restaurante (pedido do cliente em 03/11): na página de
-- acompanhamento, "Algum problema? Fale com o restaurante"; no painel, a conversa no cartão do
-- pedido. Aberta enquanto o pedido anda e até 24 h depois de entregue ou cancelado.
-- O cliente não tem conta: como no acompanhamento, o id do pedido (uuid) funciona como senha.

-- Hora em que o pedido terminou (entregue ou cancelado); só o banco define.
alter table public.pedidos add column finalizado_em timestamptz;
update public.pedidos set finalizado_em = coalesce(cancelado_em, criado_em)
where status in ('entregue', 'cancelado') and finalizado_em is null;

create or replace function rest_privado.pedidos_finalizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.finalizado_em := case when new.status in ('entregue', 'cancelado') then now() end;
  elsif new.status is distinct from old.status and new.status in ('entregue', 'cancelado') then
    new.finalizado_em := now();
  elsif new.status not in ('entregue', 'cancelado') then
    new.finalizado_em := null;
  else
    new.finalizado_em := old.finalizado_em;
  end if;
  return new;
end;
$$;
create trigger t45_finalizado before insert or update on public.pedidos
for each row execute function rest_privado.pedidos_finalizado();

create table public.pedidos_mensagens (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  pedido_id uuid not null,
  autor text not null check (autor in ('cliente', 'equipe')),
  membro_id uuid,
  texto text not null check (length(btrim(texto)) between 1 and 1000),
  criado_em timestamptz not null default now(),
  lida_em timestamptz,
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id) on delete cascade
);
create index pedidos_mensagens_pedido_idx on public.pedidos_mensagens (restaurante_id, pedido_id, criado_em);
alter table public.pedidos_mensagens enable row level security;
revoke all on public.pedidos_mensagens from anon, authenticated;
grant select on public.pedidos_mensagens to authenticated;
-- A equipe do delivery lê (o painel e o tempo real); escrever só pelas funções abaixo.
create policy "equipe do delivery le as conversas" on public.pedidos_mensagens
  for select to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['delivery'])));
alter publication supabase_realtime add table public.pedidos_mensagens;

-- A conversa do pedido ainda aceita mensagens?
create or replace function rest_privado.conversa_aberta(p_status text, p_finalizado_em timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status not in ('entregue', 'cancelado') or coalesce(p_finalizado_em, now()) > now() - interval '24 hours';
$$;

-- Para o cliente (sem conta): só as mensagens e se ainda dá para escrever; nunca quem respondeu.
create or replace function public.conversa_pedido_publica(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'aberta', rest_privado.conversa_aberta(p.status, p.finalizado_em),
    'mensagens', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto, 'em', m.criado_em) order by m.criado_em)
      from (select * from public.pedidos_mensagens where pedido_id = p.id order by criado_em desc limit 200) m
    ), '[]'::jsonb)
  )
  from public.pedidos p join public.restaurantes r on r.id = p.restaurante_id
  where p.id = p_pedido_id and p.origem = 'delivery' and r.ativo and r.excluido_em is null;
$$;
revoke all on function public.conversa_pedido_publica(uuid) from public;
grant execute on function public.conversa_pedido_publica(uuid) to anon, authenticated;

create or replace function public.cliente_enviar_mensagem(p_pedido_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  select p.id, p.restaurante_id, p.status, p.finalizado_em into v_pedido
  from public.pedidos p join public.restaurantes r on r.id = p.restaurante_id
  where p.id = p_pedido_id and p.origem = 'delivery' and r.ativo and r.excluido_em is null
  for update of p;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if not rest_privado.conversa_aberta(v_pedido.status, v_pedido.finalizado_em) then
    raise exception 'A conversa deste pedido foi encerrada. Fale com o restaurante pelo telefone.' using errcode = 'P0001';
  end if;
  if length(v_texto) not between 1 and 1000 then
    raise exception 'Escreva a mensagem (até 1000 letras).' using errcode = 'P0001';
  end if;
  if (select count(*) from public.pedidos_mensagens
      where pedido_id = p_pedido_id and autor = 'cliente' and criado_em > now() - interval '10 minutes') >= 15
     or (select count(*) from public.pedidos_mensagens where pedido_id = p_pedido_id and autor = 'cliente') >= 60 then
    raise exception 'Muitas mensagens. Aguarde a resposta do restaurante.' using errcode = 'P0001';
  end if;
  insert into public.pedidos_mensagens (restaurante_id, pedido_id, autor, texto)
  values (v_pedido.restaurante_id, p_pedido_id, 'cliente', v_texto);
end;
$$;
revoke all on function public.cliente_enviar_mensagem(uuid, text) from public;
grant execute on function public.cliente_enviar_mensagem(uuid, text) to anon, authenticated;

-- A equipe responde (quem tem o delivery); responder também marca as mensagens do cliente como lidas.
create or replace function public.equipe_enviar_mensagem(p_pedido_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  select id, restaurante_id, status, finalizado_em, origem into v_pedido from public.pedidos where id = p_pedido_id;
  if not found or v_pedido.origem <> 'delivery' or not rest_privado.tem_permissao(v_pedido.restaurante_id, array['delivery']) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not rest_privado.conversa_aberta(v_pedido.status, v_pedido.finalizado_em) then
    raise exception 'A conversa deste pedido foi encerrada (24 h depois de terminar).' using errcode = 'P0001';
  end if;
  if length(v_texto) not between 1 and 1000 then
    raise exception 'Escreva a mensagem (até 1000 letras).' using errcode = 'P0001';
  end if;
  insert into public.pedidos_mensagens (restaurante_id, pedido_id, autor, membro_id, texto)
  values (v_pedido.restaurante_id, p_pedido_id, 'equipe', rest_privado.membro_atual(v_pedido.restaurante_id), v_texto);
  update public.pedidos_mensagens set lida_em = now()
  where pedido_id = p_pedido_id and autor = 'cliente' and lida_em is null;
end;
$$;
revoke all on function public.equipe_enviar_mensagem(uuid, text) from public, anon;
grant execute on function public.equipe_enviar_mensagem(uuid, text) to authenticated;

create or replace function public.marcar_conversa_lida(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante uuid;
begin
  select restaurante_id into v_restaurante from public.pedidos where id = p_pedido_id;
  if v_restaurante is null or not rest_privado.tem_permissao(v_restaurante, array['delivery']) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.pedidos_mensagens set lida_em = now()
  where pedido_id = p_pedido_id and autor = 'cliente' and lida_em is null;
end;
$$;
revoke all on function public.marcar_conversa_lida(uuid) from public, anon;
grant execute on function public.marcar_conversa_lida(uuid) to authenticated;
