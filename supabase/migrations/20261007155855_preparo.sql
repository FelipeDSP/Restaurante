-- Rota de preparo e "pra viagem".
-- Cada produto tem etapas (praça + ordem): mesma ordem = ao mesmo tempo; ordem maior = depois.
-- O item congela as etapas no lançamento, como o preço. "Pra viagem" vem do produto, do
-- garçom (por item) ou do delivery (sempre).

-- ---------------------------------------------------------------------------
-- Etapas do produto
-- ---------------------------------------------------------------------------

create table public.produto_etapas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  produto_id uuid not null,
  estacao_id uuid not null,
  ordem integer not null default 1 check (ordem between 1 and 10),
  unique (restaurante_id, produto_id, estacao_id),
  foreign key (restaurante_id, produto_id) references public.produtos (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, estacao_id) references public.estacoes (restaurante_id, id) on delete cascade
);
create index produto_etapas_restaurante_estacao_idx on public.produto_etapas (restaurante_id, estacao_id);

create trigger t00_restaurante_fixo before update on public.produto_etapas
  for each row execute function rest_privado.restaurante_fixo();

-- A praça única de antes vira a primeira etapa.
insert into public.produto_etapas (restaurante_id, produto_id, estacao_id, ordem)
select restaurante_id, id, estacao_id, 1 from public.produtos where estacao_id is not null;

alter table public.produtos drop column estacao_id;

alter table public.produtos add column para_viagem boolean not null default false;

-- ---------------------------------------------------------------------------
-- Item: etapas congeladas e "pra viagem"
-- ---------------------------------------------------------------------------

-- Conversão dos itens já lançados sem passar pelos gatilhos de alteração
-- (eles recusariam itens cancelados e ainda conhecem a coluna antiga).
alter table public.itens_pedido disable trigger t10_antes_atualizar;
alter table public.itens_pedido disable trigger t20_depois_alterar;

-- [{"estacao_id": uuid, "ordem": int}, ...]
alter table public.itens_pedido
  add column etapas jsonb not null default '[]'::jsonb check (jsonb_typeof(etapas) = 'array');
update public.itens_pedido
set etapas = jsonb_build_array(jsonb_build_object('estacao_id', estacao_id, 'ordem', 1))
where estacao_id is not null;
alter table public.itens_pedido drop column estacao_id;

-- Sem default: o trigger decide (pedido de delivery, garçom ou o padrão do produto).
alter table public.itens_pedido add column para_viagem boolean;
update public.itens_pedido i set para_viagem = (p.origem = 'delivery')
from public.pedidos p where p.id = i.pedido_id;
alter table public.itens_pedido alter column para_viagem set not null;

alter table public.itens_pedido enable trigger t10_antes_atualizar;
alter table public.itens_pedido enable trigger t20_depois_alterar;

create or replace function rest_privado.itens_pedido_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_preco integer;
  v_disponivel boolean;
  v_viagem boolean;
  v_status_pedido text;
  v_origem text;
  v_comanda_id uuid;
  v_status_comanda text;
  v_adicionais jsonb;
begin
  select nome, preco, disponivel, para_viagem
  into v_nome, v_preco, v_disponivel, v_viagem
  from public.produtos
  where id = new.produto_id and restaurante_id = new.restaurante_id;

  if v_nome is null then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;
  if not v_disponivel then
    raise exception 'Produto indisponível: %.', v_nome using errcode = 'P0001';
  end if;

  select status, origem, comanda_id into v_status_pedido, v_origem, v_comanda_id
  from public.pedidos
  where id = new.pedido_id and restaurante_id = new.restaurante_id;

  if v_status_pedido is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_status_pedido = 'cancelado' then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;
  if v_comanda_id is not null then
    select status into v_status_comanda from public.comandas where id = v_comanda_id;
    if v_status_comanda not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
  end if;

  -- Opções: o cliente manda só os ids; nome e preço vêm do cadastro.
  v_adicionais := rest_privado.montar_adicionais(new.restaurante_id, new.produto_id, new.adicionais);

  -- Preço e rota de preparo congelados: sempre do cadastro, nunca do cliente.
  new.nome_produto := v_nome;
  new.preco_unitario := v_preco;
  new.etapas := coalesce((
    select jsonb_agg(jsonb_build_object('estacao_id', pe.estacao_id, 'ordem', pe.ordem) order by pe.ordem, e.ordem)
    from public.produto_etapas pe
    join public.estacoes e on e.id = pe.estacao_id and e.restaurante_id = pe.restaurante_id and e.ativa
    where pe.produto_id = new.produto_id and pe.restaurante_id = new.restaurante_id
  ), '[]'::jsonb);
  -- Delivery sempre sai embalado; no salão vale o que o garçom marcou ou o padrão do produto.
  new.para_viagem := case when v_origem = 'delivery' then true else coalesce(new.para_viagem, v_viagem) end;
  new.adicionais := v_adicionais -> 'itens';
  new.preco_adicionais := (v_adicionais ->> 'total')::integer;
  new.total := (v_preco + new.preco_adicionais) * new.quantidade;
  new.criado_em := now();
  new.cancelado_em := null;
  new.cancelado_por := null;
  new.motivo_cancelamento := null;
  return new;
end;
$$;

create or replace function rest_privado.itens_pedido_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is not null then
    raise exception 'Item já cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and status = 'cancelado') then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;

  -- Para trocar as opções, cancela o item e lança de novo. "Pra viagem" pode mudar.
  new.pedido_id := old.pedido_id;
  new.produto_id := old.produto_id;
  new.nome_produto := old.nome_produto;
  new.preco_unitario := old.preco_unitario;
  new.etapas := old.etapas;
  new.adicionais := old.adicionais;
  new.preco_adicionais := old.preco_adicionais;
  new.criado_em := old.criado_em;
  new.para_viagem := coalesce(new.para_viagem, old.para_viagem);

  if new.cancelado_em is not null then
    if coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_em := now();
    new.cancelado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.cancelado_por := null;
    new.motivo_cancelamento := null;
  end if;

  new.total := (new.preco_unitario + new.preco_adicionais) * new.quantidade;
  return new;
end;
$$;

-- Uma tarefa (ticket) por praça da rota do item.
create or replace function rest_privado.itens_pedido_criar_tarefa()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.tarefas_producao (restaurante_id, pedido_id, estacao_id)
  select distinct new.restaurante_id, new.pedido_id, (e ->> 'estacao_id')::uuid
  from jsonb_array_elements(new.etapas) e
  on conflict (restaurante_id, pedido_id, estacao_id) do update
    set status = 'pendente'
    where public.tarefas_producao.status = 'pronto';
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC do garçom: "pra viagem" por item
-- ---------------------------------------------------------------------------

-- p_itens: [{"produto_id", "quantidade", "observacao"?, "adicionais"?: [uuid], "para_viagem"?: bool}, ...]
create or replace function public.lancar_itens_comanda(p_comanda_id uuid, p_itens jsonb)
returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_pedido_id uuid;
  v_numero integer;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade integer;
  v_observacao text;
  v_viagem boolean;
begin
  -- Pela RLS, só encontra comandas do restaurante de quem chama.
  select restaurante_id into v_restaurante_id from public.comandas where id = p_comanda_id;
  if v_restaurante_id is null then
    raise exception 'Comanda não encontrada.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item para lançar.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'Itens demais de uma vez.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (restaurante_id, origem, comanda_id)
  values (v_restaurante_id, 'mesa', p_comanda_id)
  returning id, numero into v_pedido_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    begin
      v_produto_id := (v_item ->> 'produto_id')::uuid;
      v_quantidade := (v_item ->> 'quantidade')::integer;
      v_viagem := (v_item ->> 'para_viagem')::boolean;
    exception when others then
      raise exception 'Item inválido.' using errcode = 'P0001';
    end;
    v_observacao := nullif(btrim(coalesce(v_item ->> 'observacao', '')), '');

    if v_quantidade is null or v_quantidade not between 1 and 99 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    if length(v_observacao) > 300 then
      raise exception 'Observação muito longa.' using errcode = 'P0001';
    end if;

    -- Nome, preço, opções, rota e "pra viagem" padrão são preenchidos pelo trigger.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais, para_viagem)
    values (v_restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, v_observacao, coalesce(v_item -> 'adicionais', '[]'::jsonb), v_viagem);
  end loop;

  return jsonb_build_object('pedido_id', v_pedido_id, 'numero', v_numero);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS das etapas: membros leem, dono escreve
-- ---------------------------------------------------------------------------

alter table public.produto_etapas enable row level security;

revoke all on public.produto_etapas from anon;
revoke truncate, references, trigger on public.produto_etapas from authenticated;

create policy "membros leem etapas" on public.produto_etapas
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy "dono cria etapas" on public.produto_etapas
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita etapas" on public.produto_etapas
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga etapas" on public.produto_etapas
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
