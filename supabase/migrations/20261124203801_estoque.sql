-- Controle de estoque (pedido do cliente em 24/11: "o dono ter controle melhor do estoque e, se
-- acabar, o produto ficar inativo no cardápio").
--
-- Um modelo só, em vez de duas contabilidades: o que se conta é o ITEM DE ESTOQUE e o produto
-- consome itens pela ficha (produto_insumos). "Estoque por produto" é a ficha de 1 para 1
-- (o produto "Coca lata" consome 1 un do item "Coca lata"); ficha técnica é a mesma coisa com
-- vários itens (o burger consome 1 pão + 0,180 kg de blend).
--
-- Regras:
--   - O saldo nunca é escrito pelo app: vem do extrato (estoque_movimentos), que é imutável e
--     guarda quem fez e quando, como já vale para pagamentos e pedidos.
--   - A venda baixa no lançamento do item e a devolução desfaz exatamente o que foi baixado
--     (a ficha pode ter mudado entre uma coisa e outra).
--   - Faltou insumo: o produto some do cardápio do CLIENTE (site e QR). A equipe continua
--     lançando — contagem errada é comum e travar o salão no meio do serviço é pior.
--   - Estoque é módulo do plano Avançado (e Completo).

-- ---------------------------------------------------------------------------
-- Permissão e módulo
-- ---------------------------------------------------------------------------

create or replace function rest_privado.permissoes_validas()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    'caixa_operar', 'caixa_estornar', 'delivery', 'comandas_painel', 'comandas_gerenciar', 'garcom_app', 'cozinha_tela',
    'relatorios', 'cardapio', 'mesas', 'cupons', 'entregadores', 'impressao', 'restaurante', 'estoque'
  ];
$$;

create or replace function rest_privado.modulos_validos()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['mesas', 'garcom', 'qr', 'cozinha', 'relatorios', 'cupons', 'entregadores', 'estoque'];
$$;

create or replace function rest_privado.permissoes_do_modulo(p_modulo text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_modulo
    when 'mesas' then array['comandas_painel', 'comandas_gerenciar', 'mesas']
    when 'garcom' then array['garcom_app']
    when 'cozinha' then array['cozinha_tela', 'impressao']
    when 'relatorios' then array['relatorios']
    when 'cupons' then array['cupons']
    when 'entregadores' then array['entregadores']
    when 'estoque' then array['estoque']
    else '{}'::text[]
  end;
$$;

-- Estoque entra no Avançado (decisão do cliente em 24/11); o resto continua igual.
create or replace function rest_privado.modulos_do_restaurante(p_restaurante_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select m from unnest(rest_privado.modulos_validos()) as m
    where not rest_privado.restaurante_suspenso(p_restaurante_id)
    and (
      a.restaurante_id is null or a.status = 'teste'
      or m = any (a.modulos_liberados)
      or m in ('cozinha', 'relatorios', 'cupons', 'entregadores')
      or (m = 'mesas' and a.plano in ('presencial', 'avancado', 'completo'))
      or (m = 'garcom' and a.plano in ('avancado', 'completo'))
      or (m = 'estoque' and a.plano in ('avancado', 'completo'))
      or (m = 'qr' and a.plano = 'completo')
    )
    and not m = any (coalesce(a.modulos_bloqueados, '{}'))
  )
  from (select 1) as base
  left join public.assinaturas a on a.restaurante_id = p_restaurante_id;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  unidade text not null default 'un' check (unidade in ('un', 'kg', 'g', 'l', 'ml')),
  -- Saldo mantido pelo trigger do extrato; o app nunca escreve (sem grant de update nesta coluna).
  saldo numeric(12,3) not null default 0,
  -- Abaixo disto o painel avisa (0 = não avisa).
  minimo numeric(12,3) not null default 0 check (minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nome)
);
create index estoque_itens_restaurante on public.estoque_itens (restaurante_id, ativo, nome);

-- Ficha: quanto de cada item sai quando o produto é vendido.
create table public.produto_insumos (
  restaurante_id uuid not null references public.restaurantes (id),
  produto_id uuid not null,
  item_id uuid not null,
  quantidade numeric(12,3) not null check (quantidade > 0),
  primary key (restaurante_id, produto_id, item_id),
  foreign key (restaurante_id, produto_id) references public.produtos (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, item_id) references public.estoque_itens (restaurante_id, id) on delete cascade
);
create index produto_insumos_item on public.produto_insumos (restaurante_id, item_id);

-- Extrato: nada é apagado nem alterado.
create table public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  item_id uuid not null,
  -- Positivo entra, negativo sai.
  quantidade numeric(12,3) not null check (quantidade <> 0),
  motivo text not null check (motivo in ('compra', 'venda', 'perda', 'ajuste', 'devolucao')),
  item_pedido_id uuid,
  -- Quanto custou a entrada, em centavos (prepara o custo médio depois).
  custo_total integer check (custo_total is null or custo_total >= 0),
  observacao text check (length(observacao) <= 300),
  feito_por uuid,
  saldo_depois numeric(12,3) not null,
  criado_em timestamptz not null default now(),
  foreign key (restaurante_id, item_id) references public.estoque_itens (restaurante_id, id),
  foreign key (restaurante_id, item_pedido_id) references public.itens_pedido (restaurante_id, id),
  foreign key (restaurante_id, feito_por) references public.membros (restaurante_id, id)
);
create index estoque_movimentos_item on public.estoque_movimentos (restaurante_id, item_id, criado_em desc);
create index estoque_movimentos_item_pedido on public.estoque_movimentos (restaurante_id, item_pedido_id)
  where item_pedido_id is not null;

create trigger t00_restaurante_fixo before update on public.estoque_itens
for each row execute function rest_privado.restaurante_fixo();
create trigger t00_restaurante_fixo before update on public.produto_insumos
for each row execute function rest_privado.restaurante_fixo();

-- ---------------------------------------------------------------------------
-- Extrato manda no saldo
-- ---------------------------------------------------------------------------

create function rest_privado.estoque_movimento_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo numeric(12,3);
begin
  -- Trava a linha do item: duas vendas ao mesmo tempo não se perdem.
  select saldo into v_saldo
  from public.estoque_itens
  where id = new.item_id and restaurante_id = new.restaurante_id
  for update;

  if v_saldo is null then
    raise exception 'Item de estoque não encontrado.' using errcode = 'P0001';
  end if;

  new.saldo_depois := v_saldo + new.quantidade;
  new.criado_em := now();
  -- Quem fez (null quando é o cliente pelo site: a venda é do sistema).
  new.feito_por := rest_privado.membro_atual(new.restaurante_id);

  update public.estoque_itens set saldo = new.saldo_depois where id = new.item_id;
  return new;
end;
$$;

create trigger t10_saldo before insert on public.estoque_movimentos
for each row execute function rest_privado.estoque_movimento_antes_inserir();

create function rest_privado.estoque_movimento_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O extrato do estoque não muda. Lance um movimento contrário.' using errcode = 'P0001';
end;
$$;

create trigger t20_imutavel before update or delete on public.estoque_movimentos
for each row execute function rest_privado.estoque_movimento_fixo();

-- ---------------------------------------------------------------------------
-- Venda e devolução
-- ---------------------------------------------------------------------------

-- Item lançado: sai do estoque o que a ficha manda.
create function rest_privado.estoque_baixar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.estoque_movimentos (restaurante_id, item_id, quantidade, motivo, item_pedido_id, saldo_depois)
  select new.restaurante_id, pi.item_id, -(pi.quantidade * new.quantidade), 'venda', new.id, 0
  from public.produto_insumos pi
  join public.estoque_itens i on i.id = pi.item_id and i.restaurante_id = pi.restaurante_id
  where pi.restaurante_id = new.restaurante_id and pi.produto_id = new.produto_id and i.ativo;
  return null;
end;
$$;

create trigger t50_estoque_baixa after insert on public.itens_pedido
for each row execute function rest_privado.estoque_baixar();

-- Devolve exatamente o que saiu por este item (a ficha pode ter mudado no meio do caminho),
-- e só uma vez.
create function rest_privado.estoque_devolver(p_item_pedido_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.estoque_movimentos (restaurante_id, item_id, quantidade, motivo, item_pedido_id, saldo_depois)
  select m.restaurante_id, m.item_id, -m.quantidade, 'devolucao', m.item_pedido_id, 0
  from public.estoque_movimentos m
  where m.item_pedido_id = p_item_pedido_id and m.motivo = 'venda'
    and not exists (
      select 1 from public.estoque_movimentos d
      where d.item_pedido_id = p_item_pedido_id and d.motivo = 'devolucao' and d.item_id = m.item_id
    );
$$;

create function rest_privado.estoque_item_cancelado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cancelado_em is not null and old.cancelado_em is null then
    perform rest_privado.estoque_devolver(new.id);
  end if;
  return null;
end;
$$;

create trigger t51_estoque_devolucao after update on public.itens_pedido
for each row execute function rest_privado.estoque_item_cancelado();

-- Pedido cancelado inteiro: os itens não são cancelados um a um, então devolve por aqui.
create function rest_privado.estoque_pedido_cancelado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid;
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    for v_item in
      select i.id from public.itens_pedido i where i.pedido_id = new.id and i.cancelado_em is null
    loop
      perform rest_privado.estoque_devolver(v_item);
    end loop;
  end if;
  return null;
end;
$$;

create trigger t50_estoque_devolucao after update of status on public.pedidos
for each row execute function rest_privado.estoque_pedido_cancelado();

-- ---------------------------------------------------------------------------
-- Faltou insumo: some do cardápio do cliente (a equipe continua lançando)
-- ---------------------------------------------------------------------------

create or replace function rest_privado.produto_no_cardapio(p_restaurante_id uuid, p_produto_id uuid, p_momento timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dias smallint[];
begin
  select p.dias into v_dias
  from public.produtos p
  where p.id = p_produto_id and p.restaurante_id = p_restaurante_id;

  -- Dia da semana do produto (null = todos os dias).
  if v_dias is not null
     and not (rest_privado.dia_do_servico(p_restaurante_id, p_momento) = any (v_dias)) then
    return false;
  end if;

  -- Estoque: falta insumo para montar uma unidade.
  if exists (
    select 1
    from public.produto_insumos pi
    join public.estoque_itens i on i.id = pi.item_id and i.restaurante_id = pi.restaurante_id
    where pi.restaurante_id = p_restaurante_id and pi.produto_id = p_produto_id
      and i.ativo and i.saldo < pi.quantidade
  ) then
    return false;
  end if;

  -- Sem cardápio ligado (ou só com cardápio desligado): aparece em qualquer horário.
  if not exists (
    select 1
    from public.cardapios_produtos cp
    join public.cardapios c on c.id = cp.cardapio_id and c.restaurante_id = cp.restaurante_id and c.ativo
    where cp.restaurante_id = p_restaurante_id and cp.produto_id = p_produto_id
  ) then
    return true;
  end if;

  -- Com cardápio: só na janela dele.
  return exists (
    select 1 from public.cardapios_produtos cp
    where cp.restaurante_id = p_restaurante_id and cp.produto_id = p_produto_id
      and cp.cardapio_id = any (rest_privado.cardapios_agora(p_restaurante_id, p_momento))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.estoque_itens enable row level security;
revoke all on public.estoque_itens from anon, authenticated;
grant select on public.estoque_itens to authenticated;
grant insert (restaurante_id, nome, unidade, minimo) on public.estoque_itens to authenticated;
grant update (nome, unidade, minimo, ativo) on public.estoque_itens to authenticated;
grant delete on public.estoque_itens to authenticated;

create policy estoque_itens_ler on public.estoque_itens
  for select to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));
create policy estoque_itens_criar on public.estoque_itens
  for insert to authenticated
  with check ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));
create policy estoque_itens_alterar on public.estoque_itens
  for update to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])))
  with check ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));
create policy estoque_itens_apagar on public.estoque_itens
  for delete to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));

alter table public.produto_insumos enable row level security;
revoke all on public.produto_insumos from anon, authenticated;
grant select, insert, update, delete on public.produto_insumos to authenticated;

create policy produto_insumos_ler on public.produto_insumos
  for select to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));
create policy produto_insumos_criar on public.produto_insumos
  for insert to authenticated
  with check ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));
create policy produto_insumos_alterar on public.produto_insumos
  for update to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])))
  with check ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));
create policy produto_insumos_apagar on public.produto_insumos
  for delete to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));

-- O extrato só se lê pela API: quem escreve é o banco (venda) ou as RPCs abaixo.
alter table public.estoque_movimentos enable row level security;
revoke all on public.estoque_movimentos from anon, authenticated;
grant select on public.estoque_movimentos to authenticated;

create policy estoque_movimentos_ler on public.estoque_movimentos
  for select to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['estoque'])));

-- ---------------------------------------------------------------------------
-- Entrada, perda e contagem
-- ---------------------------------------------------------------------------

create function public.movimentar_estoque(
  p_item_id uuid,
  p_quantidade numeric,
  p_motivo text,
  p_observacao text default null,
  p_custo_total integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante uuid;
  v_saldo numeric(12,3);
begin
  select restaurante_id into v_restaurante from public.estoque_itens where id = p_item_id;
  if v_restaurante is null then
    raise exception 'Item de estoque não encontrado.' using errcode = 'P0001';
  end if;
  if not rest_privado.tem_permissao(v_restaurante, array['estoque']) then
    raise exception 'Sem permissão para mexer no estoque.' using errcode = 'P0001';
  end if;
  if p_motivo not in ('compra', 'perda', 'ajuste') then
    raise exception 'Motivo inválido.' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade = 0 then
    raise exception 'Informe a quantidade.' using errcode = 'P0001';
  end if;
  -- Perda sai, compra entra: o sinal é do motivo, não de quem chama.
  insert into public.estoque_movimentos (restaurante_id, item_id, quantidade, motivo, observacao, custo_total, saldo_depois)
  values (
    v_restaurante, p_item_id,
    case when p_motivo = 'perda' then -abs(p_quantidade) when p_motivo = 'compra' then abs(p_quantidade) else p_quantidade end,
    p_motivo, nullif(btrim(p_observacao), ''), p_custo_total, 0
  )
  returning saldo_depois into v_saldo;

  return jsonb_build_object('saldo', v_saldo);
end;
$$;

-- Contagem: o dono informa quanto tem de verdade e o banco lança a diferença.
create function public.ajustar_estoque(p_item_id uuid, p_saldo numeric, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante uuid;
  v_atual numeric(12,3);
  v_novo numeric(12,3);
begin
  select restaurante_id into v_restaurante from public.estoque_itens where id = p_item_id;
  if v_restaurante is null then
    raise exception 'Item de estoque não encontrado.' using errcode = 'P0001';
  end if;
  if not rest_privado.tem_permissao(v_restaurante, array['estoque']) then
    raise exception 'Sem permissão para mexer no estoque.' using errcode = 'P0001';
  end if;
  if p_saldo is null then
    raise exception 'Informe a contagem.' using errcode = 'P0001';
  end if;

  -- Trava a linha antes de medir a diferença (duas contagens ao mesmo tempo não se atropelam).
  select saldo into v_atual from public.estoque_itens where id = p_item_id for update;
  if v_atual = p_saldo then
    return jsonb_build_object('saldo', v_atual);
  end if;

  insert into public.estoque_movimentos (restaurante_id, item_id, quantidade, motivo, observacao, saldo_depois)
  values (v_restaurante, p_item_id, p_saldo - v_atual, 'ajuste', nullif(btrim(p_observacao), ''), 0)
  returning saldo_depois into v_novo;

  return jsonb_build_object('saldo', v_novo);
end;
$$;

revoke execute on function public.movimentar_estoque(uuid, numeric, text, text, integer) from public, anon;
grant execute on function public.movimentar_estoque(uuid, numeric, text, text, integer) to authenticated;
revoke execute on function public.ajustar_estoque(uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_estoque(uuid, numeric, text) to authenticated;
