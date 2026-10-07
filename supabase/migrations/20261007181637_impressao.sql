-- Impressão (fase 2): impressoras, computadores pareados (agentes) e fila de impressão.
-- A fila guarda só referências; o servidor monta o papel na hora de imprimir e o agente
-- (app no computador do caixa) só leva os bytes até a impressora.

-- ---------------------------------------------------------------------------
-- Computadores pareados (agentes)
-- ---------------------------------------------------------------------------

create table public.agentes_impressao (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  -- Código de 6 dígitos para parear (só o hash; vale poucos minutos).
  codigo_hash text,
  codigo_expira_em timestamptz,
  -- Chave do agente depois de pareado (só o hash).
  token_hash text unique,
  pareado_em timestamptz,
  ultimo_contato_em timestamptz,
  versao text check (length(versao) <= 40),
  -- Impressoras instaladas no Windows desse computador (para escolher no painel).
  impressoras_windows jsonb not null default '[]'::jsonb check (jsonb_typeof(impressoras_windows) = 'array'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id)
);
create index agentes_impressao_codigo_idx on public.agentes_impressao (codigo_hash) where codigo_hash is not null;

create trigger t00_restaurante_fixo before update on public.agentes_impressao
  for each row execute function rest_privado.restaurante_fixo();

-- ---------------------------------------------------------------------------
-- Impressoras
-- ---------------------------------------------------------------------------

create table public.impressoras (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 60),
  -- rede: IP + porta (ESC/POS direto). windows: nome da impressora instalada no Windows (USB).
  conexao text not null default 'rede' check (conexao in ('rede', 'windows')),
  endereco text not null check (length(btrim(endereco)) between 1 and 200),
  porta integer not null default 9100 check (porta between 1 and 65535),
  largura integer not null default 80 check (largura in (58, 80)),
  codificacao text not null default 'cp850' check (codificacao in ('cp850', 'cp1252', 'sem_acentos')),
  -- Computador que imprime nela (vazio = qualquer computador pareado do restaurante).
  agente_id uuid,
  imprime_conta boolean not null default false,
  imprime_via_delivery boolean not null default false,
  ativa boolean not null default true,
  ultimo_sucesso_em timestamptz,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nome),
  foreign key (restaurante_id, agente_id) references public.agentes_impressao (restaurante_id, id) on delete set null (agente_id)
);
create index impressoras_restaurante_agente_idx on public.impressoras (restaurante_id, agente_id);

create trigger t00_restaurante_fixo before update on public.impressoras
  for each row execute function rest_privado.restaurante_fixo();

-- Cada praça imprime numa impressora (várias praças podem dividir a mesma).
alter table public.estacoes add column impressora_id uuid;
alter table public.estacoes add constraint estacoes_restaurante_id_impressora_id_fkey
  foreign key (restaurante_id, impressora_id) references public.impressoras (restaurante_id, id)
  on delete set null (impressora_id);
create index estacoes_restaurante_impressora_idx on public.estacoes (restaurante_id, impressora_id);

-- ---------------------------------------------------------------------------
-- Fila de impressão
-- ---------------------------------------------------------------------------

-- Referência composta (restaurante + id), como nas outras tabelas.
alter table public.tarefas_producao add constraint tarefas_producao_restaurante_id_id_key unique (restaurante_id, id);

create table public.fila_impressao (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  impressora_id uuid not null,
  tipo text not null check (tipo in ('producao', 'conta', 'delivery', 'cancelamento', 'teste')),
  tarefa_id uuid,
  pedido_id uuid,
  comanda_id uuid,
  item_id uuid,
  status text not null default 'pendente' check (status in ('pendente', 'imprimindo', 'impresso', 'erro')),
  tentativas integer not null default 0,
  erro text,
  agente_id uuid,
  criado_em timestamptz not null default now(),
  pego_em timestamptz,
  impresso_em timestamptz,
  -- Depois de uma falha, espera um pouco antes de tentar de novo (10 s, 20 s, 30 s...).
  tentar_depois_em timestamptz,
  foreign key (restaurante_id, impressora_id) references public.impressoras (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, tarefa_id) references public.tarefas_producao (restaurante_id, id),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id),
  foreign key (restaurante_id, comanda_id) references public.comandas (restaurante_id, id),
  foreign key (restaurante_id, agente_id) references public.agentes_impressao (restaurante_id, id) on delete set null (agente_id)
);
create index fila_impressao_restaurante_status_idx on public.fila_impressao (restaurante_id, status, criado_em);
create index fila_impressao_restaurante_impressora_idx on public.fila_impressao (restaurante_id, impressora_id);
create index fila_impressao_restaurante_tarefa_idx on public.fila_impressao (restaurante_id, tarefa_id);
create index fila_impressao_restaurante_pedido_idx on public.fila_impressao (restaurante_id, pedido_id);
create index fila_impressao_restaurante_comanda_idx on public.fila_impressao (restaurante_id, comanda_id);
create index fila_impressao_restaurante_agente_idx on public.fila_impressao (restaurante_id, agente_id);

-- Impressora ativa da praça (null se a praça não imprime).
create function rest_privado.impressora_da_praca(p_estacao_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select i.id
  from public.estacoes e
  join public.impressoras i on i.id = e.impressora_id and i.restaurante_id = e.restaurante_id and i.ativa
  where e.id = p_estacao_id;
$$;

-- Ticket novo de praça: vai para a fila (delivery só depois que o caixa aceita).
create function rest_privado.tarefas_producao_enfileirar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_impressora uuid := rest_privado.impressora_da_praca(new.estacao_id);
begin
  if v_impressora is not null and exists (
    select 1 from public.pedidos p
    where p.id = new.pedido_id and p.status <> 'cancelado' and not (p.origem = 'delivery' and p.status = 'recebido')
  ) then
    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, tarefa_id, pedido_id)
    values (new.restaurante_id, v_impressora, 'producao', new.id, new.pedido_id);
  end if;
  return null;
end;
$$;

create trigger t30_enfileirar after insert on public.tarefas_producao
  for each row execute function rest_privado.tarefas_producao_enfileirar();

-- Delivery aceito pelo caixa: tickets das praças + via completa para o motoboy.
create function rest_privado.pedidos_enfileirar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.origem = 'delivery' and old.status = 'recebido' and new.status not in ('recebido', 'cancelado') then
    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, tarefa_id, pedido_id)
    select t.restaurante_id, rest_privado.impressora_da_praca(t.estacao_id), 'producao', t.id, t.pedido_id
    from public.tarefas_producao t
    where t.pedido_id = new.id
      and rest_privado.impressora_da_praca(t.estacao_id) is not null
      and not exists (select 1 from public.fila_impressao f where f.tarefa_id = t.id and f.tipo = 'producao');

    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, pedido_id)
    select new.restaurante_id, i.id, 'delivery', new.id
    from public.impressoras i
    where i.restaurante_id = new.restaurante_id and i.ativa and i.imprime_via_delivery;
  end if;
  return null;
end;
$$;

create trigger t30_enfileirar after update on public.pedidos
  for each row execute function rest_privado.pedidos_enfileirar();

-- Item cancelado depois de impresso: aviso de cancelamento na praça.
create function rest_privado.itens_pedido_enfileirar_cancelamento()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is null and new.cancelado_em is not null then
    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, tarefa_id, pedido_id, item_id)
    select distinct on (t.id) new.restaurante_id, f.impressora_id, 'cancelamento', t.id, new.pedido_id, new.id
    from jsonb_array_elements(new.etapas) e
    join public.tarefas_producao t
      on t.pedido_id = new.pedido_id and t.estacao_id = (e ->> 'estacao_id')::uuid
    join public.fila_impressao f on f.tarefa_id = t.id and f.tipo = 'producao' and f.status = 'impresso';
  end if;
  return null;
end;
$$;

create trigger t40_enfileirar_cancelamento after update on public.itens_pedido
  for each row execute function rest_privado.itens_pedido_enfileirar_cancelamento();

revoke all on function rest_privado.impressora_da_praca(uuid) from public, anon, authenticated;
revoke all on function rest_privado.tarefas_producao_enfileirar() from public, anon, authenticated;
revoke all on function rest_privado.pedidos_enfileirar() from public, anon, authenticated;
revoke all on function rest_privado.itens_pedido_enfileirar_cancelamento() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs da equipe: conta, teste e reimpressão
-- ---------------------------------------------------------------------------

-- Conta da comanda nas impressoras de conta. Retorna quantas vão imprimir (0 = nenhuma configurada).
create function public.imprimir_conta(p_comanda_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_qtd integer;
begin
  select restaurante_id into v_restaurante_id from public.comandas where id = p_comanda_id;
  if v_restaurante_id is null or not rest_privado.eh_membro(v_restaurante_id) then
    raise exception 'Comanda não encontrada.' using errcode = 'P0001';
  end if;
  insert into public.fila_impressao (restaurante_id, impressora_id, tipo, comanda_id)
  select v_restaurante_id, i.id, 'conta', p_comanda_id
  from public.impressoras i
  where i.restaurante_id = v_restaurante_id and i.ativa and i.imprime_conta;
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

create function public.imprimir_teste(p_impressora_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  select restaurante_id into v_restaurante_id from public.impressoras where id = p_impressora_id;
  if v_restaurante_id is null or not rest_privado.tem_papel(v_restaurante_id, array['dono', 'caixa']) then
    raise exception 'Impressora não encontrada.' using errcode = 'P0001';
  end if;
  insert into public.fila_impressao (restaurante_id, impressora_id, tipo)
  values (v_restaurante_id, p_impressora_id, 'teste');
end;
$$;

-- Imprime de novo (cópia na fila, mesma impressora).
create function public.reimprimir(p_fila_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v public.fila_impressao;
begin
  select * into v from public.fila_impressao where id = p_fila_id;
  if v.id is null or not rest_privado.eh_membro(v.restaurante_id) then
    raise exception 'Impressão não encontrada.' using errcode = 'P0001';
  end if;
  insert into public.fila_impressao (restaurante_id, impressora_id, tipo, tarefa_id, pedido_id, comanda_id, item_id)
  values (v.restaurante_id, v.impressora_id, v.tipo, v.tarefa_id, v.pedido_id, v.comanda_id, v.item_id);
end;
$$;

revoke all on function public.imprimir_conta(uuid) from public, anon;
revoke all on function public.imprimir_teste(uuid) from public, anon;
revoke all on function public.reimprimir(uuid) from public, anon;
grant execute on function public.imprimir_conta(uuid) to authenticated;
grant execute on function public.imprimir_teste(uuid) to authenticated;
grant execute on function public.reimprimir(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs do agente (só o servidor, com a chave secreta, depois de conferir o token)
-- ---------------------------------------------------------------------------

-- Pega até p_limite trabalhos pendentes das impressoras deste agente, travando cada um
-- (dois computadores nunca pegam o mesmo). Trabalho preso em "imprimindo" há 2 min volta.
create function public.agente_pegar_trabalhos(p_agente_id uuid, p_limite integer default 5)
returns setof public.fila_impressao
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  update public.agentes_impressao set ultimo_contato_em = now()
  where id = p_agente_id and ativo
  returning restaurante_id into v_restaurante_id;
  if v_restaurante_id is null then
    return;
  end if;

  update public.fila_impressao set status = 'pendente', pego_em = null
  where restaurante_id = v_restaurante_id and status = 'imprimindo' and pego_em < now() - interval '2 minutes';

  return query
  with pegos as (
    update public.fila_impressao f
    set status = 'imprimindo', pego_em = now(), agente_id = p_agente_id, tentativas = f.tentativas + 1
    where f.id in (
      select f2.id
      from public.fila_impressao f2
      join public.impressoras i on i.id = f2.impressora_id and i.ativa
      where f2.restaurante_id = v_restaurante_id
        and f2.status = 'pendente'
        and (f2.tentar_depois_em is null or f2.tentar_depois_em <= now())
        and (i.agente_id is null or i.agente_id = p_agente_id)
      order by f2.criado_em
      limit greatest(1, least(p_limite, 20))
      for update of f2 skip locked
    )
    returning f.*
  )
  select * from pegos order by criado_em;
end;
$$;

-- Resultado de um trabalho. Falha volta para a fila (esperando 10 s x tentativas) até 5
-- tentativas, cerca de 2 minutos no total; depois fica em erro e aparece no painel.
create function public.agente_concluir(p_agente_id uuid, p_fila_id uuid, p_ok boolean, p_erro text default null)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v public.fila_impressao;
begin
  select * into v from public.fila_impressao where id = p_fila_id and agente_id = p_agente_id;
  if v.id is null then
    return;
  end if;
  if p_ok then
    update public.fila_impressao set status = 'impresso', impresso_em = now(), erro = null where id = v.id;
    update public.impressoras set ultimo_sucesso_em = now(), ultimo_erro = null where id = v.impressora_id;
  else
    update public.fila_impressao
    set status = case when v.tentativas >= 5 then 'erro' else 'pendente' end,
        erro = left(p_erro, 300), pego_em = null,
        tentar_depois_em = now() + make_interval(secs => 10 * v.tentativas)
    where id = v.id;
    update public.impressoras set ultimo_erro = left(p_erro, 300), ultimo_erro_em = now() where id = v.impressora_id;
  end if;
end;
$$;

revoke all on function public.agente_pegar_trabalhos(uuid, integer) from public, anon, authenticated;
revoke all on function public.agente_concluir(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.agente_pegar_trabalhos(uuid, integer) to service_role;
grant execute on function public.agente_concluir(uuid, uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: dono configura; dono e caixa acompanham; ninguém escreve na fila direto
-- ---------------------------------------------------------------------------

alter table public.agentes_impressao enable row level security;
alter table public.impressoras enable row level security;
alter table public.fila_impressao enable row level security;

revoke all on public.agentes_impressao, public.impressoras, public.fila_impressao from anon;
revoke all on public.agentes_impressao, public.fila_impressao from authenticated;
revoke truncate, references, trigger on public.impressoras from authenticated;

-- Hashes nunca saem do banco para o navegador.
grant select (id, restaurante_id, nome, codigo_expira_em, pareado_em, ultimo_contato_em, versao, impressoras_windows, ativo, criado_em)
  on public.agentes_impressao to authenticated;
grant insert (restaurante_id, nome, codigo_hash, codigo_expira_em) on public.agentes_impressao to authenticated;
grant update (nome, ativo, codigo_hash, codigo_expira_em) on public.agentes_impressao to authenticated;
grant select on public.fila_impressao to authenticated;

create policy "dono e caixa veem computadores" on public.agentes_impressao
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
create policy "dono cria computadores" on public.agentes_impressao
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita computadores" on public.agentes_impressao
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "dono e caixa veem impressoras" on public.impressoras
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
create policy "dono cria impressoras" on public.impressoras
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita impressoras" on public.impressoras
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga impressoras" on public.impressoras
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "dono e caixa veem a fila" on public.fila_impressao
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));

-- Painel acompanha a fila em tempo real.
alter publication supabase_realtime add table public.fila_impressao;
