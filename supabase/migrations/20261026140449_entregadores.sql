-- Entregadores e acerto das entregas (pedido do chefe: "cadastro de entregadores para cálculo de
-- pagamento de entregas" e "relatórios de entregas por entregador").
-- O entregador é escolhido quando o pedido sai para entrega; o valor dele fica congelado no pedido.

create table public.entregadores (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 2 and 80),
  telefone text check (telefone is null or telefone ~ '^\d{10,13}$'),
  -- Quanto recebe por entrega: a taxa de entrega cobrada do cliente ou um valor fixo.
  recebe_taxa boolean not null default true,
  valor_por_entrega integer not null default 0 check (valor_por_entrega between 0 and 100000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id)
);

create index entregadores_restaurante on public.entregadores (restaurante_id, ativo, nome);

alter table public.entregadores enable row level security;
revoke all on public.entregadores from anon, authenticated;
grant select on public.entregadores to authenticated;
grant insert (restaurante_id, nome, telefone, recebe_taxa, valor_por_entrega) on public.entregadores to authenticated;
grant update (nome, telefone, recebe_taxa, valor_por_entrega, ativo) on public.entregadores to authenticated;

create policy entregadores_ler on public.entregadores
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
create policy entregadores_criar on public.entregadores
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy entregadores_alterar on public.entregadores
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

alter table public.pedidos
  add column entregador_id uuid,
  add column valor_entregador integer not null default 0 check (valor_entregador >= 0),
  add foreign key (restaurante_id, entregador_id) references public.entregadores (restaurante_id, id);

create index pedidos_restaurante_entregador on public.pedidos (restaurante_id, entregador_id) where entregador_id is not null;

-- Quem escolhe o entregador é o dono ou o caixa; o valor vem do cadastro (nunca de quem chama) e
-- acompanha a taxa se ela mudar na edição do pedido.
create or replace function rest_privado.pedidos_entregador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.entregadores;
begin
  if tg_op = 'INSERT' then
    new.entregador_id := null;
    new.valor_entregador := 0;
    return new;
  end if;

  if new.entregador_id is distinct from old.entregador_id then
    if new.origem <> 'delivery' then
      raise exception 'Só pedido de delivery tem entregador.' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null and not rest_privado.tem_papel(new.restaurante_id, array['dono', 'caixa']) then
      raise exception 'Apenas dono ou caixa escolhem o entregador.' using errcode = 'P0001';
    end if;
    if old.status in ('entregue', 'cancelado') then
      raise exception 'Pedido já finalizado.' using errcode = 'P0001';
    end if;
  end if;

  if new.entregador_id is null then
    new.valor_entregador := 0;
  elsif new.entregador_id is distinct from old.entregador_id or new.taxa_entrega is distinct from old.taxa_entrega then
    select * into v_e from public.entregadores where id = new.entregador_id and restaurante_id = new.restaurante_id;
    if v_e.id is null or (new.entregador_id is distinct from old.entregador_id and not v_e.ativo) then
      raise exception 'Entregador inválido.' using errcode = 'P0001';
    end if;
    new.valor_entregador := case when v_e.recebe_taxa then new.taxa_entrega else v_e.valor_por_entrega end;
  else
    new.valor_entregador := old.valor_entregador;
  end if;
  return new;
end;
$$;

create trigger t06_entregador
before insert or update on public.pedidos
for each row execute function rest_privado.pedidos_entregador();

-- Resumo do caixa: entregas por entregador na sessão (pedidos não cancelados).
create or replace function public.entregas_da_sessao(p_sessao_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'entregas', entregas, 'valor', valor) order by nome), '[]'::jsonb)
  from (
    select e.nome, count(*) as entregas, sum(p.valor_entregador) as valor
    from public.pedidos p
    join public.entregadores e on e.id = p.entregador_id
    where p.caixa_sessao_id = p_sessao_id and p.status <> 'cancelado'
    group by e.nome
  ) x;
$$;

revoke execute on function public.entregas_da_sessao(uuid) from public, anon;
grant execute on function public.entregas_da_sessao(uuid) to authenticated;

-- Relatórios: entregas por entregador no período (as noites contam pelo dia em que o caixa abriu).
create or replace function public.entregas_do_periodo(p_restaurante_id uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fuso text;
begin
  if not (select rest_privado.tem_papel(p_restaurante_id, array['dono'])) then
    raise exception 'Só o dono vê os relatórios.' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;
  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'entregas', entregas, 'valor', valor) order by entregas desc), '[]'::jsonb)
    from (
      select e.nome, count(*) as entregas, sum(p.valor_entregador) as valor
      from public.pedidos p
      join public.caixa_sessoes s on s.id = p.caixa_sessao_id
      join public.entregadores e on e.id = p.entregador_id
      where p.restaurante_id = p_restaurante_id
        and p.status <> 'cancelado'
        and (s.aberta_em at time zone v_fuso)::date between p_de and p_ate
      group by e.nome
    ) x
  );
end;
$$;

revoke execute on function public.entregas_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.entregas_do_periodo(uuid, date, date) to authenticated;
