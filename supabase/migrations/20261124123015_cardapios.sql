-- Cardápios por horário (almoço e janta no mesmo restaurante) e dia da semana no produto
-- (prato do dia que repete toda semana), pedido do cliente em 24/11.
--
-- Duas perguntas diferentes, dois campos diferentes:
--   cardápio      -> "a que horas este produto aparece" (Almoço 11:00-15:00, Janta 18:00-23:00)
--   produtos.dias -> "em que dias da semana ele aparece" (feijoada só na quarta)
--
-- Regras:
--   - Produto sem cardápio ligado aparece sempre (todo restaurante de hoje continua igual), e o
--     mesmo vale para quem só tem cardápio desligado: cardápio desligado não esconde nada.
--   - Produto ligado a um cardápio aparece só nas janelas dele. Quem põe os executivos no
--     cardápio Almoço não precisa criar o cardápio da janta para eles sumirem de noite.
--   - O filtro vale para o cliente (site do delivery e QR da mesa). A equipe lança o que quiser
--     (o dono não é impedido, e a cozinha pode servir o almoço às 17h).
--   - "Dia" é o dia do serviço: antes das 5h da manhã ainda conta como a noite anterior.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.cardapios (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  -- Dias da semana em que este cardápio vale (0 = domingo).
  dias smallint[] not null default '{0,1,2,3,4,5,6}'
    check (array_length(dias, 1) between 1 and 7 and dias <@ array[0,1,2,3,4,5,6]::smallint[]),
  -- Janela do dia. "fecha" <= "abre" cruza a meia-noite (mesma convenção de restaurantes.horarios).
  abre time not null,
  fecha time not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nome)
);
create index cardapios_restaurante_ordem on public.cardapios (restaurante_id, ordem);

create table public.cardapios_produtos (
  restaurante_id uuid not null references public.restaurantes (id),
  cardapio_id uuid not null,
  produto_id uuid not null,
  primary key (restaurante_id, cardapio_id, produto_id),
  foreign key (restaurante_id, cardapio_id) references public.cardapios (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, produto_id) references public.produtos (restaurante_id, id) on delete cascade
);
create index cardapios_produtos_produto on public.cardapios_produtos (restaurante_id, produto_id);

-- null = todos os dias.
alter table public.produtos add column dias smallint[]
  check (dias is null or (array_length(dias, 1) between 1 and 7 and dias <@ array[0,1,2,3,4,5,6]::smallint[]));

-- Qual cardápio estava valendo quando o pedido entrou (só o banco define; serve para o relatório).
alter table public.pedidos
  add column cardapio_id uuid,
  add foreign key (restaurante_id, cardapio_id) references public.cardapios (restaurante_id, id);
create index pedidos_restaurante_cardapio on public.pedidos (restaurante_id, cardapio_id) where cardapio_id is not null;

create trigger t00_restaurante_fixo before update on public.cardapios
for each row execute function rest_privado.restaurante_fixo();
create trigger t00_restaurante_fixo before update on public.cardapios_produtos
for each row execute function rest_privado.restaurante_fixo();

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Dia da semana do serviço (0 = domingo), no fuso do restaurante: antes das 5h ainda é a noite
-- anterior, então o sábado da feijoada continua sábado à 0h30.
create function rest_privado.dia_do_servico(p_restaurante_id uuid, p_momento timestamptz default now())
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select extract(dow from ((p_momento at time zone r.fuso_horario) - interval '5 hours'))::smallint
  from public.restaurantes r
  where r.id = p_restaurante_id;
$$;

-- Cardápios valendo neste momento, na ordem do cadastro. Cardápio sem nenhum produto ligado não
-- entra: senão uma janela criada e esquecida esconderia o cardápio inteiro.
create function rest_privado.cardapios_agora(p_restaurante_id uuid, p_momento timestamptz default now())
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with agora as (
    select (p_momento at time zone r.fuso_horario) as hora_local
    from public.restaurantes r
    where r.id = p_restaurante_id
  )
  select coalesce(array_agg(c.id order by c.ordem, c.nome), '{}'::uuid[])
  from public.cardapios c, agora a
  where c.restaurante_id = p_restaurante_id
    and c.ativo
    and (
      case when c.fecha > c.abre then
        -- Janela dentro do mesmo dia.
        extract(dow from a.hora_local)::smallint = any (c.dias)
          and a.hora_local::time >= c.abre and a.hora_local::time < c.fecha
      else
        -- Cruza a meia-noite: o dia marcado é o dia em que abriu.
        (extract(dow from a.hora_local)::smallint = any (c.dias) and a.hora_local::time >= c.abre)
        or (((extract(dow from a.hora_local)::integer + 6) % 7)::smallint = any (c.dias) and a.hora_local::time < c.fecha)
      end
    )
    and exists (
      select 1 from public.cardapios_produtos cp
      where cp.restaurante_id = p_restaurante_id and cp.cardapio_id = c.id
    );
$$;

-- O produto aparece para o cliente neste momento?
create function rest_privado.produto_no_cardapio(p_restaurante_id uuid, p_produto_id uuid, p_momento timestamptz default now())
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

-- Para a equipe: o que está valendo agora, para a tela marcar o que é de outro horário. A conta de
-- horário fica só aqui; o app não repete essa regra.
create function public.cardapio_agora(p_restaurante_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select rest_privado.eh_membro(p_restaurante_id)) then jsonb_build_object(
      'cardapios', to_jsonb(rest_privado.cardapios_agora(p_restaurante_id)),
      'dia', rest_privado.dia_do_servico(p_restaurante_id)
    )
  end;
$$;

revoke execute on function public.cardapio_agora(uuid) from public, anon;
grant execute on function public.cardapio_agora(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cardapios enable row level security;
revoke all on public.cardapios from anon, authenticated;
grant select on public.cardapios to authenticated;
grant insert (restaurante_id, nome, dias, abre, fecha, ordem) on public.cardapios to authenticated;
grant update (nome, dias, abre, fecha, ativo, ordem) on public.cardapios to authenticated;
grant delete on public.cardapios to authenticated;

create policy cardapios_ler on public.cardapios
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy cardapios_criar on public.cardapios
  for insert to authenticated
  with check ((select rest_privado.tem_permissao(restaurante_id, array['cardapio'])));
create policy cardapios_alterar on public.cardapios
  for update to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['cardapio'])))
  with check ((select rest_privado.tem_permissao(restaurante_id, array['cardapio'])));
create policy cardapios_apagar on public.cardapios
  for delete to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['cardapio'])));

alter table public.cardapios_produtos enable row level security;
revoke all on public.cardapios_produtos from anon, authenticated;
grant select, insert, delete on public.cardapios_produtos to authenticated;

create policy cardapios_produtos_ler on public.cardapios_produtos
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy cardapios_produtos_ligar on public.cardapios_produtos
  for insert to authenticated
  with check ((select rest_privado.tem_permissao(restaurante_id, array['cardapio'])));
create policy cardapios_produtos_desligar on public.cardapios_produtos
  for delete to authenticated
  using ((select rest_privado.tem_permissao(restaurante_id, array['cardapio'])));

-- O cardápio do cliente passa a respeitar o horário e o dia da semana.
drop policy "publico le produtos do delivery" on public.produtos;
create policy "publico le produtos do delivery" on public.produtos
  for select to anon
  using (
    disponivel and disponivel_delivery
    and (select rest_privado.restaurante_publico(restaurante_id))
    and rest_privado.produto_no_cardapio(restaurante_id, id)
  );

drop policy "usuarios leem produtos do delivery ou do proprio restaurante" on public.produtos;
create policy "usuarios leem produtos do delivery ou do proprio restaurante" on public.produtos
  for select to authenticated
  using (
    -- eh_membro primeiro: a equipe vê o cardápio inteiro sem passar pela conta de horário.
    (select rest_privado.eh_membro(restaurante_id))
    or (
      disponivel and disponivel_delivery
      and (select rest_privado.restaurante_publico(restaurante_id))
      and rest_privado.produto_no_cardapio(restaurante_id, id)
    )
  );

-- ---------------------------------------------------------------------------
-- Cardápio do salão (QR da mesa): mesmo filtro do site.
-- ---------------------------------------------------------------------------

create or replace function public.cardapio_salao_publico(p_restaurante_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c.categoria order by c.ordem, c.nome), '[]'::jsonb)
  from (
    select cat.ordem, cat.nome, jsonb_build_object(
      'id', cat.id,
      'nome', cat.nome,
      'produtos', (
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'nome', p.nome,
          'descricao', p.descricao,
          'preco', p.preco,
          'foto_url', p.foto_url,
          -- Passa pela cozinha? O que não passa (ex.: bebida) pergunta "agora ou com a comida".
          'preparo', exists (
            select 1 from public.produto_etapas pe
            join public.estacoes e on e.id = pe.estacao_id and e.restaurante_id = pe.restaurante_id and e.ativa
            where pe.produto_id = p.id and pe.restaurante_id = p_restaurante_id
          ),
          'grupos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', g.id,
              'nome', g.nome,
              'minimo', g.minimo,
              'maximo', g.maximo,
              'repetir', g.repetir,
              'opcoes', (
                select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'preco', a.preco) order by a.ordem, a.nome)
                from public.adicionais a
                where a.grupo_id = g.id and a.restaurante_id = p_restaurante_id and a.disponivel
              )
            ) order by g.ordem, g.nome)
            from public.produtos_grupos_adicionais pg
            join public.grupos_adicionais g on g.id = pg.grupo_id and g.restaurante_id = p_restaurante_id
            where pg.produto_id = p.id and pg.restaurante_id = p_restaurante_id and g.ativo
              and exists (select 1 from public.adicionais a where a.grupo_id = g.id and a.disponivel)
          ), '[]'::jsonb)
        ) order by p.ordem, p.nome)
        from public.produtos p
        where p.categoria_id = cat.id and p.restaurante_id = p_restaurante_id and p.disponivel
          and rest_privado.produto_no_cardapio(p_restaurante_id, p.id)
      )
    ) as categoria
    from public.categorias cat
    where cat.restaurante_id = p_restaurante_id
      and cat.ativa
      and rest_privado.restaurante_publico(p_restaurante_id)
      and exists (
        select 1 from public.produtos p
        where p.categoria_id = cat.id and p.restaurante_id = p_restaurante_id and p.disponivel
          and rest_privado.produto_no_cardapio(p_restaurante_id, p.id)
      )
  ) c;
$$;


-- ---------------------------------------------------------------------------
-- Lançamento: o cliente só pede o que está no cardápio de agora; a equipe lança o que quiser.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rest_privado.itens_pedido_antes_inserir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  v_pedido_criado timestamptz;
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

  -- Cardápio do horário e dia da semana: valem para quem pede pelo site ou pelo QR da mesa.
  -- A equipe lança o que quiser (o dono não é impedido; a cozinha pode servir o almoço às 17h).
  if not rest_privado.eh_membro(new.restaurante_id)
     and not rest_privado.produto_no_cardapio(new.restaurante_id, new.produto_id) then
    raise exception 'Fora do cardápio deste horário: %. Tire do carrinho e envie de novo. (indisponivel)',
      v_nome using errcode = 'P0001';
  end if;

  select status, origem, comanda_id, criado_em into v_status_pedido, v_origem, v_comanda_id, v_pedido_criado
  from public.pedidos
  where id = new.pedido_id and restaurante_id = new.restaurante_id;

  if v_status_pedido is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_status_pedido = 'cancelado' then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;
  -- now() é o início da transação: igual ao criado_em = o pedido está sendo criado agora.
  if v_origem = 'delivery' and v_pedido_criado <> now() and not rest_privado.edicao_autorizada(new.pedido_id) then
    raise exception 'Os itens do delivery só mudam pela edição do pedido.' using errcode = 'P0001';
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
  -- "Junto com a comida" só vale para o que não passa pela cozinha (ex.: bebida) e só na mesa.
  new.servir_com_comida := coalesce(new.servir_com_comida, false) and v_origem = 'mesa' and jsonb_array_length(new.etapas) = 0;
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


-- ---------------------------------------------------------------------------
-- Em qual cardápio o pedido entrou (só o banco define) e relatório por cardápio.
-- ---------------------------------------------------------------------------

create function rest_privado.pedidos_cardapio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Mais de um cardápio no mesmo horário: vale o primeiro da ordem do cadastro.
    new.cardapio_id := (rest_privado.cardapios_agora(new.restaurante_id))[1];
  else
    new.cardapio_id := old.cardapio_id;
  end if;
  return new;
end;
$$;

create trigger t13_cardapio
before insert or update on public.pedidos
for each row execute function rest_privado.pedidos_cardapio();

-- Vendido por cardápio no período, com as mesmas definições de relatorio_vendas
-- (itens não cancelados de pedidos não cancelados + taxa - desconto).
create function public.vendas_por_cardapio(p_restaurante_id uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fuso text;
begin
  if not (select rest_privado.tem_permissao(p_restaurante_id, array['relatorios'])) then
    raise exception 'Sem permissão para ver os relatórios.' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;
  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'nome', nome, 'pedidos', pedidos, 'vendido', vendido
    ) order by vendido desc), '[]'::jsonb)
    from (
      select coalesce(c.nome, 'Fora dos cardápios') as nome,
        count(distinct case when p.origem = 'mesa' then p.comanda_id::text else p.id::text end) as pedidos,
        sum(
          coalesce((
            select sum(i.total) from public.itens_pedido i
            where i.pedido_id = p.id and i.restaurante_id = p_restaurante_id and i.cancelado_em is null
          ), 0) + p.taxa_entrega - p.desconto
        ) as vendido
      from public.pedidos p
      join public.caixa_sessoes s on s.id = p.caixa_sessao_id
      left join public.cardapios c on c.id = p.cardapio_id
      where p.restaurante_id = p_restaurante_id
        and p.status <> 'cancelado'
        and (s.aberta_em at time zone v_fuso)::date between p_de and p_ate
      group by c.nome
    ) x
  );
end;
$$;

revoke execute on function public.vendas_por_cardapio(uuid, date, date) from public, anon;
grant execute on function public.vendas_por_cardapio(uuid, date, date) to authenticated;
