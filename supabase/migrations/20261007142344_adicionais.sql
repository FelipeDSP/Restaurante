-- Adicionais e opções: grupos reutilizáveis (ex.: "Ponto da carne", "Adicionais") com
-- mínimo/máximo de escolhas, ligados a produtos. O item do pedido guarda um retrato
-- (nome e preço do momento) das opções escolhidas, como já faz com o produto.

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.grupos_adicionais (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  minimo integer not null default 0 check (minimo between 0 and 20),
  maximo integer not null default 1 check (maximo between 1 and 20),
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  check (minimo <= maximo)
);
create index grupos_adicionais_restaurante_ordem_idx on public.grupos_adicionais (restaurante_id, ordem);

create table public.adicionais (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  grupo_id uuid not null,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  preco integer not null default 0 check (preco between 0 and 1000000),
  disponivel boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  foreign key (restaurante_id, grupo_id) references public.grupos_adicionais (restaurante_id, id) on delete cascade
);
create index adicionais_restaurante_grupo_idx on public.adicionais (restaurante_id, grupo_id, ordem);

create table public.produtos_grupos_adicionais (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  produto_id uuid not null,
  grupo_id uuid not null,
  unique (restaurante_id, produto_id, grupo_id),
  foreign key (restaurante_id, produto_id) references public.produtos (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, grupo_id) references public.grupos_adicionais (restaurante_id, id) on delete cascade
);
create index produtos_grupos_adicionais_restaurante_grupo_idx on public.produtos_grupos_adicionais (restaurante_id, grupo_id);

create trigger t00_restaurante_fixo before update on public.grupos_adicionais
  for each row execute function rest_privado.restaurante_fixo();
create trigger t00_restaurante_fixo before update on public.adicionais
  for each row execute function rest_privado.restaurante_fixo();
create trigger t00_restaurante_fixo before update on public.produtos_grupos_adicionais
  for each row execute function rest_privado.restaurante_fixo();

-- Retrato das opções no item: [{"id", "grupo_id", "grupo", "nome", "preco"}].
-- Na inserção, o cliente manda só os ids (["uuid", ...]); o trigger valida e monta o retrato.
alter table public.itens_pedido
  add column adicionais jsonb not null default '[]'::jsonb check (jsonb_typeof(adicionais) = 'array'),
  add column preco_adicionais integer not null default 0 check (preco_adicionais >= 0);

-- ---------------------------------------------------------------------------
-- RLS: membros leem, dono escreve, público lê o que está ativo
-- ---------------------------------------------------------------------------

alter table public.grupos_adicionais enable row level security;
alter table public.adicionais enable row level security;
alter table public.produtos_grupos_adicionais enable row level security;

revoke all on public.grupos_adicionais, public.adicionais, public.produtos_grupos_adicionais from anon;
grant select on public.grupos_adicionais, public.adicionais, public.produtos_grupos_adicionais to anon;
revoke truncate, references, trigger on public.grupos_adicionais, public.adicionais, public.produtos_grupos_adicionais
  from authenticated;
revoke update on public.produtos_grupos_adicionais from authenticated;

create policy "publico le grupos ativos" on public.grupos_adicionais
  for select to anon
  using (ativo and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "usuarios leem grupos ativos ou do proprio restaurante" on public.grupos_adicionais
  for select to authenticated
  using (
    (ativo and (select rest_privado.restaurante_publico(restaurante_id)))
    or (select rest_privado.eh_membro(restaurante_id))
  );
create policy "dono cria grupos" on public.grupos_adicionais
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita grupos" on public.grupos_adicionais
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga grupos" on public.grupos_adicionais
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "publico le adicionais disponiveis" on public.adicionais
  for select to anon
  using (disponivel and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "usuarios leem adicionais disponiveis ou do proprio restaurante" on public.adicionais
  for select to authenticated
  using (
    (disponivel and (select rest_privado.restaurante_publico(restaurante_id)))
    or (select rest_privado.eh_membro(restaurante_id))
  );
create policy "dono cria adicionais" on public.adicionais
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono edita adicionais" on public.adicionais
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono apaga adicionais" on public.adicionais
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create policy "publico le grupos dos produtos" on public.produtos_grupos_adicionais
  for select to anon
  using ((select rest_privado.restaurante_publico(restaurante_id)));
create policy "usuarios leem grupos dos produtos" on public.produtos_grupos_adicionais
  for select to authenticated
  using (
    (select rest_privado.restaurante_publico(restaurante_id))
    or (select rest_privado.eh_membro(restaurante_id))
  );
create policy "dono liga grupos a produtos" on public.produtos_grupos_adicionais
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy "dono desliga grupos de produtos" on public.produtos_grupos_adicionais
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

-- ---------------------------------------------------------------------------
-- Validação e preço das opções escolhidas
-- ---------------------------------------------------------------------------

-- Recebe os ids escolhidos (["uuid", ...] ou [{"id": "uuid"}, ...]) e devolve
-- {"itens": [retrato...], "total": centavos}. Falha se alguma opção não for do produto,
-- estiver indisponível ou se algum grupo ativo do produto ficar fora do mínimo/máximo.
create function rest_privado.montar_adicionais(p_restaurante_id uuid, p_produto_id uuid, p_escolhidos jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_encontrados integer;
  v_nome text;
  v_grupo record;
  v_qtd integer;
  v_itens jsonb;
  v_total integer;
begin
  if p_escolhidos is null or jsonb_typeof(p_escolhidos) = 'null' then
    p_escolhidos := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_escolhidos) <> 'array' or jsonb_array_length(p_escolhidos) > 30 then
    raise exception 'Adicionais inválidos.' using errcode = 'P0001';
  end if;

  begin
    select coalesce(array_agg(distinct (
             case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end
           )::uuid), '{}')
    into v_ids
    from jsonb_array_elements(p_escolhidos) e;
  exception when others then
    raise exception 'Adicionais inválidos.' using errcode = 'P0001';
  end;
  if array_position(v_ids, null) is not null then
    raise exception 'Adicionais inválidos.' using errcode = 'P0001';
  end if;

  -- Toda opção escolhida tem que ser de um grupo ligado a este produto.
  select count(*) into v_encontrados
  from public.adicionais a
  join public.produtos_grupos_adicionais pg
    on pg.grupo_id = a.grupo_id and pg.restaurante_id = a.restaurante_id and pg.produto_id = p_produto_id
  where a.id = any (v_ids) and a.restaurante_id = p_restaurante_id;
  if v_encontrados <> cardinality(v_ids) then
    raise exception 'Adicional não disponível para este produto.' using errcode = 'P0001';
  end if;

  select a.nome into v_nome
  from public.adicionais a
  join public.grupos_adicionais g on g.id = a.grupo_id
  where a.id = any (v_ids) and (not a.disponivel or not g.ativo)
  limit 1;
  if v_nome is not null then
    raise exception 'Adicional indisponível: %.', v_nome using errcode = 'P0001';
  end if;

  -- Mínimo e máximo de cada grupo ativo do produto.
  for v_grupo in
    select g.id, g.nome, g.minimo, g.maximo
    from public.produtos_grupos_adicionais pg
    join public.grupos_adicionais g on g.id = pg.grupo_id and g.restaurante_id = pg.restaurante_id
    where pg.produto_id = p_produto_id and pg.restaurante_id = p_restaurante_id and g.ativo
  loop
    select count(*) into v_qtd from public.adicionais a where a.grupo_id = v_grupo.id and a.id = any (v_ids);
    if v_qtd < v_grupo.minimo then
      raise exception 'Escolha % em "%".',
        case when v_grupo.minimo = 1 then '1 opção' else v_grupo.minimo || ' opções' end, v_grupo.nome
        using errcode = 'P0001';
    end if;
    if v_qtd > v_grupo.maximo then
      raise exception 'Escolha no máximo % em "%".',
        case when v_grupo.maximo = 1 then '1 opção' else v_grupo.maximo || ' opções' end, v_grupo.nome
        using errcode = 'P0001';
    end if;
  end loop;

  select
    coalesce(jsonb_agg(
      jsonb_build_object('id', a.id, 'grupo_id', g.id, 'grupo', g.nome, 'nome', a.nome, 'preco', a.preco)
      order by g.ordem, g.nome, a.ordem, a.nome
    ), '[]'::jsonb),
    coalesce(sum(a.preco), 0)::integer
  into v_itens, v_total
  from public.adicionais a
  join public.grupos_adicionais g on g.id = a.grupo_id
  where a.id = any (v_ids);

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end;
$$;

revoke all on function rest_privado.montar_adicionais(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- itens_pedido: preço = (produto + opções) x quantidade
-- ---------------------------------------------------------------------------

create or replace function rest_privado.itens_pedido_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_preco integer;
  v_disponivel boolean;
  v_status_pedido text;
  v_comanda_id uuid;
  v_status_comanda text;
  v_adicionais jsonb;
begin
  select nome, preco, disponivel into v_nome, v_preco, v_disponivel
  from public.produtos
  where id = new.produto_id and restaurante_id = new.restaurante_id;

  if v_nome is null then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;
  if not v_disponivel then
    raise exception 'Produto indisponível: %.', v_nome using errcode = 'P0001';
  end if;

  select status, comanda_id into v_status_pedido, v_comanda_id
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

  -- Preço congelado: sempre do cadastro, nunca do cliente.
  new.nome_produto := v_nome;
  new.preco_unitario := v_preco;
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

  -- Para trocar as opções, cancela o item e lança de novo.
  new.pedido_id := old.pedido_id;
  new.produto_id := old.produto_id;
  new.nome_produto := old.nome_produto;
  new.preco_unitario := old.preco_unitario;
  new.adicionais := old.adicionais;
  new.preco_adicionais := old.preco_adicionais;
  new.criado_em := old.criado_em;

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

-- ---------------------------------------------------------------------------
-- RPCs passam as opções escolhidas de cada item
-- ---------------------------------------------------------------------------

-- p_itens: [{"produto_id": uuid, "quantidade": int, "observacao": text?, "adicionais": [uuid, ...]?}, ...]
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

    -- Nome, preço e opções são preenchidos pelo trigger a partir do cadastro.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais)
    values (v_restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, v_observacao, coalesce(v_item -> 'adicionais', '[]'::jsonb));
  end loop;

  return jsonb_build_object('pedido_id', v_pedido_id, 'numero', v_numero);
end;
$$;

create or replace function public.criar_pedido_delivery(
  p_restaurante_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_bairro_id uuid,
  p_endereco jsonb,
  p_forma_pagamento text,
  p_itens jsonb,
  p_troco_para integer default null,
  p_observacao text default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_disponibilidade jsonb;
  v_pedido_minimo integer;
  v_taxa integer;
  v_pedido_id uuid;
  v_numero integer;
  v_subtotal integer;
  v_total integer;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade integer;
  v_telefone text := regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g');
begin
  -- Restaurante aberto para delivery.
  v_disponibilidade := public.consultar_disponibilidade_delivery(p_restaurante_id);
  if not (v_disponibilidade ->> 'aberto')::boolean then
    raise exception 'Restaurante não está recebendo pedidos agora (%).', v_disponibilidade ->> 'motivo'
      using errcode = 'P0001';
  end if;

  -- Cliente e endereço.
  if length(btrim(coalesce(p_cliente_nome, ''))) not between 2 and 120 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if length(v_telefone) not between 10 and 13 then
    raise exception 'Telefone inválido.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_endereco) <> 'object'
     or length(btrim(coalesce(p_endereco ->> 'rua', ''))) = 0
     or length(btrim(coalesce(p_endereco ->> 'numero', ''))) = 0
     or length(p_endereco::text) > 1000 then
    raise exception 'Endereço inválido.' using errcode = 'P0001';
  end if;
  if p_forma_pagamento is null or p_forma_pagamento not in ('dinheiro', 'pix', 'credito', 'debito') then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  if length(p_observacao) > 500 then
    raise exception 'Observação muito longa.' using errcode = 'P0001';
  end if;

  -- Bairro atendido.
  select taxa into v_taxa
  from public.bairros_entrega
  where id = p_bairro_id and restaurante_id = p_restaurante_id and ativo;
  if v_taxa is null then
    raise exception 'Bairro não atendido.' using errcode = 'P0001';
  end if;

  -- Itens.
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido não tem itens.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'Itens demais no pedido.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    restaurante_id, origem, cliente_nome, cliente_telefone, endereco, bairro_id,
    taxa_entrega, forma_pagamento_prevista, troco_para, observacao
  ) values (
    p_restaurante_id, 'delivery', btrim(p_cliente_nome), v_telefone, p_endereco, p_bairro_id,
    v_taxa, p_forma_pagamento, case when p_forma_pagamento = 'dinheiro' then p_troco_para end,
    nullif(btrim(p_observacao), '')
  )
  returning id, numero into v_pedido_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    begin
      v_produto_id := (v_item ->> 'produto_id')::uuid;
      v_quantidade := (v_item ->> 'quantidade')::integer;
    exception when others then
      raise exception 'Item inválido.' using errcode = 'P0001';
    end;

    if v_quantidade is null or v_quantidade not between 1 and 99 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    if length(v_item ->> 'observacao') > 300 then
      raise exception 'Observação do item muito longa.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.produtos p
      join public.categorias c on c.id = p.categoria_id
      where p.id = v_produto_id
        and p.restaurante_id = p_restaurante_id
        and p.disponivel and p.disponivel_delivery and c.ativa
    ) then
      raise exception 'Produto indisponível para delivery.' using errcode = 'P0001';
    end if;

    -- Nome, preço e opções são preenchidos pelo trigger a partir do cadastro.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais)
    values (p_restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, nullif(btrim(v_item ->> 'observacao'), ''),
            coalesce(v_item -> 'adicionais', '[]'::jsonb));
  end loop;

  select subtotal, total into v_subtotal, v_total from public.pedidos where id = v_pedido_id;

  select pedido_minimo into v_pedido_minimo from public.restaurantes where id = p_restaurante_id;
  if v_subtotal < v_pedido_minimo then
    raise exception 'Pedido mínimo não atingido.' using errcode = 'P0001';
  end if;
  if p_forma_pagamento = 'dinheiro' and p_troco_para is not null and p_troco_para < v_total then
    raise exception 'O troco deve ser para um valor maior que o total.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'total', v_total);
end;
$$;

create or replace function public.consultar_pedido_publico(p_pedido_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'restaurante_id', p.restaurante_id,
    'numero', p.numero,
    'status', p.status,
    'criado_em', p.criado_em,
    'subtotal', p.subtotal,
    'taxa_entrega', p.taxa_entrega,
    'total', p.total,
    'forma_pagamento_prevista', p.forma_pagamento_prevista,
    'tempo_estimado_entrega_min', r.tempo_estimado_entrega_min,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome_produto', i.nome_produto,
        'quantidade', i.quantidade,
        'preco_unitario', i.preco_unitario,
        'preco_adicionais', i.preco_adicionais,
        'adicionais', (
          select coalesce(jsonb_agg(jsonb_build_object('grupo', a ->> 'grupo', 'nome', a ->> 'nome', 'preco', (a ->> 'preco')::integer)), '[]'::jsonb)
          from jsonb_array_elements(i.adicionais) a
        ),
        'total', i.total,
        'observacao', i.observacao
      ) order by i.criado_em)
      from public.itens_pedido i
      where i.pedido_id = p.id and i.cancelado_em is null
    ), '[]'::jsonb)
  )
  from public.pedidos p
  join public.restaurantes r on r.id = p.restaurante_id
  where p.id = p_pedido_id
    and p.origem = 'delivery'
    and r.ativo and r.excluido_em is null;
$$;
