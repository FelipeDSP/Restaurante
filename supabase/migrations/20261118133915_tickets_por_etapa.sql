-- Ticket da praça por etapa da rota: (pedido, praça, ordem). Antes era um ticket por pedido e praça,
-- então um item que só passa na Chapa ficava "Aguardando Churrasqueira" junto com outro item do mesmo
-- pedido que precisa da Churrasqueira antes (teste da noite simulada, 18/11). Agora o que não depende
-- de outra praça sai num ticket próprio e pode ser feito na hora.

alter table public.tarefas_producao add column ordem integer not null default 1 check (ordem >= 1);

-- Tickets que já existem: a menor etapa daquela praça entre os itens do pedido.
update public.tarefas_producao t
set ordem = coalesce((
  select min(coalesce((e ->> 'ordem')::integer, 1))
  from public.itens_pedido i, jsonb_array_elements(i.etapas) e
  where i.pedido_id = t.pedido_id and (e ->> 'estacao_id')::uuid = t.estacao_id
), 1);

alter table public.tarefas_producao drop constraint tarefas_producao_restaurante_id_pedido_id_estacao_id_key;
alter table public.tarefas_producao
  add constraint tarefas_producao_pedido_estacao_ordem_key unique (restaurante_id, pedido_id, estacao_id, ordem);

-- A equipe não escolhe a etapa (só o status).
create or replace function rest_privado.tarefas_producao_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.pedido_id := old.pedido_id;
  new.estacao_id := old.estacao_id;
  new.ordem := old.ordem;
  new.criado_em := old.criado_em;
  if new.status = 'pronto' and old.status <> 'pronto' then
    new.pronto_em := now();
    new.pronto_por := rest_privado.membro_atual(new.restaurante_id);
  elsif new.status = 'pendente' then
    new.pronto_em := null;
    new.pronto_por := null;
  else
    new.pronto_em := old.pronto_em;
    new.pronto_por := old.pronto_por;
  end if;
  return new;
end;
$$;

create or replace function rest_privado.itens_pedido_criar_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tarefas_producao (restaurante_id, pedido_id, estacao_id, ordem)
  select distinct new.restaurante_id, new.pedido_id, (e ->> 'estacao_id')::uuid, coalesce((e ->> 'ordem')::integer, 1)
  from jsonb_array_elements(new.etapas) e
  on conflict (restaurante_id, pedido_id, estacao_id, ordem) do update
    set status = 'pendente'
    where public.tarefas_producao.status = 'pronto';
  return null;
end;
$$;

create or replace function rest_privado.itens_pedido_enfileirar_cancelamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is null and new.cancelado_em is not null then
    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, tarefa_id, pedido_id, item_id)
    select distinct on (t.id) new.restaurante_id, f.impressora_id, 'cancelamento', t.id, new.pedido_id, new.id
    from jsonb_array_elements(new.etapas) e
    join public.tarefas_producao t
      on t.pedido_id = new.pedido_id and t.estacao_id = (e ->> 'estacao_id')::uuid
     and t.ordem = coalesce((e ->> 'ordem')::integer, 1)
    join public.fila_impressao f on f.tarefa_id = t.id and f.tipo = 'producao' and f.status = 'impresso';
  end if;
  return null;
end;
$$;
