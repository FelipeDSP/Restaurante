-- Taxa de entrega fixa: o restaurante escolhe entre uma taxa única (o cliente informa o CEP e o
-- endereço) ou a lista de bairros atendidos (como era). Ninguém perde o que já tem: quem já tinha
-- bairros cadastrados continua "por bairro"; restaurante novo começa com taxa fixa.

alter table public.restaurantes
  add column taxa_entrega_modo text not null default 'fixa' check (taxa_entrega_modo in ('fixa', 'bairro')),
  add column taxa_entrega_fixa integer not null default 0 check (taxa_entrega_fixa between 0 and 100000);

update public.restaurantes r set taxa_entrega_modo = 'bairro'
where exists (select 1 from public.bairros_entrega b where b.restaurante_id = r.id);

grant select (taxa_entrega_modo, taxa_entrega_fixa) on public.restaurantes to anon, authenticated;
grant update (taxa_entrega_modo, taxa_entrega_fixa) on public.restaurantes to authenticated;

create or replace view public.restaurantes_publicos
with (security_invoker = true) as
select id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco, fuso_horario,
  horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min, taxa_entrega_modo, taxa_entrega_fixa
from public.restaurantes
where ativo and excluido_em is null;

-- Delivery precisa de bairro: da lista (bairro_id) ou digitado no endereço (taxa fixa).
alter table public.pedidos drop constraint pedidos_check1;
alter table public.pedidos add constraint pedidos_delivery_cliente_bairro check (
  origem <> 'delivery'
  or (cliente_nome is not null and cliente_telefone is not null
      and (bairro_id is not null or coalesce(btrim(endereco ->> 'bairro'), '') <> ''))
);

-- Pedido: na taxa fixa o bairro é texto no endereço (com CEP, cidade e UF) e bairro_id fica vazio.
create or replace function public.criar_pedido_delivery(
  p_restaurante_id uuid,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_bairro_id uuid,
  p_endereco jsonb,
  p_forma_pagamento text,
  p_itens jsonb,
  p_troco_para integer default null,
  p_observacao text default null,
  p_chave uuid default null,
  p_total_esperado integer default null
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
  v_nome_produto text;
  v_modo text;
  v_bairro_id uuid;
begin
  -- Mesmo envio repetido (resposta perdida na rede, toque duplo): devolve o pedido já criado.
  if p_chave is not null then
    select jsonb_build_object('id', id, 'numero', numero, 'total', total) into v_item
    from public.pedidos where restaurante_id = p_restaurante_id and chave_idempotencia = p_chave;
    if v_item is not null then
      return v_item;
    end if;
  end if;

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

  -- Taxa: fixa (o cliente digita o bairro, com ajuda do CEP) ou pela lista de bairros atendidos.
  select taxa_entrega_modo, taxa_entrega_fixa into v_modo, v_taxa
  from public.restaurantes where id = p_restaurante_id;
  if v_modo = 'fixa' then
    if length(btrim(coalesce(p_endereco ->> 'bairro', ''))) = 0 then
      raise exception 'Informe o bairro.' using errcode = 'P0001';
    end if;
    v_bairro_id := null;
  else
    select taxa into v_taxa
    from public.bairros_entrega
    where id = p_bairro_id and restaurante_id = p_restaurante_id and ativo;
    if v_taxa is null then
      raise exception 'Bairro não atendido.' using errcode = 'P0001';
    end if;
    v_bairro_id := p_bairro_id;
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
    taxa_entrega, forma_pagamento_prevista, troco_para, observacao, chave_idempotencia
  ) values (
    p_restaurante_id, 'delivery', btrim(p_cliente_nome), v_telefone, p_endereco, v_bairro_id,
    v_taxa, p_forma_pagamento, case when p_forma_pagamento = 'dinheiro' then p_troco_para end,
    nullif(btrim(p_observacao), ''), p_chave
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
      select nome into v_nome_produto from public.produtos where id = v_produto_id and restaurante_id = p_restaurante_id;
      raise exception 'Acabou de esgotar: %. Tire do carrinho e envie de novo. (indisponivel)',
        coalesce(v_nome_produto, 'um dos itens') using errcode = 'P0001';
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
  -- O cliente viu um total; se o preço mudou no meio do caminho, não cobra diferente sem avisar.
  if p_total_esperado is not null and p_total_esperado <> v_total then
    raise exception 'Os preços foram atualizados: o total agora é %. Confira o carrinho e envie de novo. (precos_mudaram)',
      rest_privado.texto_reais(v_total) using errcode = 'P0001';
  end if;
  if p_forma_pagamento = 'dinheiro' and p_troco_para is not null and p_troco_para < v_total then
    raise exception 'O troco deve ser para um valor maior que o total.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero, 'total', v_total);
end;
$$;

-- Endereços salvos na conta do cliente: bairro digitado e CEP (taxa fixa).
alter table public.clientes_enderecos alter column bairro_id drop not null;
alter table public.clientes_enderecos add column bairro text, add column cep text, add column cidade text, add column uf text;
drop index public.clientes_enderecos_unico_idx;
create unique index clientes_enderecos_unico_idx on public.clientes_enderecos
  (restaurante_id, cliente_id, coalesce(bairro_id::text, lower(coalesce(bairro, ''))), lower(rua), lower(numero), lower(coalesce(complemento, '')));

create or replace function rest_privado.pedidos_guardar_endereco()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.cliente_id is null or new.endereco is null or (new.bairro_id is null and coalesce(btrim(new.endereco ->> 'bairro'), '') = '') then
    return null;
  end if;

  insert into public.clientes_enderecos as e (restaurante_id, cliente_id, bairro_id, bairro, cep, cidade, uf, rua, numero, complemento, referencia)
  values (
    new.restaurante_id,
    new.cliente_id,
    new.bairro_id,
    case when new.bairro_id is null then btrim(new.endereco ->> 'bairro') end,
    nullif(regexp_replace(coalesce(new.endereco ->> 'cep', ''), '\D', '', 'g'), ''),
    nullif(btrim(new.endereco ->> 'cidade'), ''),
    nullif(upper(btrim(new.endereco ->> 'uf')), ''),
    btrim(new.endereco ->> 'rua'),
    btrim(new.endereco ->> 'numero'),
    nullif(btrim(new.endereco ->> 'complemento'), ''),
    nullif(btrim(new.endereco ->> 'referencia'), '')
  )
  on conflict (restaurante_id, cliente_id, coalesce(bairro_id::text, lower(coalesce(bairro, ''))), lower(rua), lower(numero), lower(coalesce(complemento, '')))
  do update set usado_em = now(), referencia = excluded.referencia, cep = coalesce(excluded.cep, e.cep);

  delete from public.clientes_enderecos
  where cliente_id = new.cliente_id
    and id not in (
      select id from public.clientes_enderecos
      where cliente_id = new.cliente_id
      order by usado_em desc
      limit 5
    );
  return null;
end;
$$;

-- Relatório: bairros digitados (taxa fixa) agrupados pelo nome.
create or replace function public.relatorio_vendas(p_restaurante_id uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_fuso text;
  v_resultado jsonb;
begin
  if not (select rest_privado.tem_papel(p_restaurante_id, array['dono'])) then
    raise exception 'Só o dono vê os relatórios.' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;

  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;

  with
  sessoes as (
    select s.id, s.aberta_em
    from public.caixa_sessoes s
    where s.restaurante_id = p_restaurante_id
      and (s.aberta_em at time zone v_fuso)::date between p_de and p_ate
  ),
  pedidos as (
    select p.*
    from public.pedidos p
    where p.restaurante_id = p_restaurante_id
      and p.caixa_sessao_id in (select id from sessoes)
  ),
  validos as (
    select * from pedidos where status <> 'cancelado'
  ),
  vendidos as (
    select i.*, p.origem, p.criado_em as pedido_em, p.caixa_sessao_id
    from public.itens_pedido i
    join validos p on p.id = i.pedido_id
    where i.restaurante_id = p_restaurante_id and i.cancelado_em is null
  ),
  -- Vendido por pedido (itens + taxa): base de origem, horário e bairro.
  por_pedido as (
    select p.id, p.origem, p.criado_em, p.caixa_sessao_id, p.bairro_id, p.endereco ->> 'bairro' as bairro_texto, p.taxa_entrega, p.comanda_id,
      coalesce((select sum(v.total) from vendidos v where v.pedido_id = p.id), 0) + p.taxa_entrega as vendido
    from validos p
  ),
  comandas as (
    select c.*
    from public.comandas c
    where c.restaurante_id = p_restaurante_id
      and c.caixa_sessao_id in (select id from sessoes)
  ),
  pagamentos as (
    select pg.*
    from public.pagamentos pg
    where pg.restaurante_id = p_restaurante_id
      and pg.caixa_sessao_id in (select id from sessoes)
  ),
  recebidos as (
    select * from pagamentos where estornado_em is null
  ),
  -- Contas = comandas fechadas + pedidos de delivery/balcão (pedidos de mesa são vários por comanda).
  contas_sessao as (
    select s.id,
      (select count(*) from comandas c where c.caixa_sessao_id = s.id and c.status = 'fechada')
      + (select count(*) from validos p where p.caixa_sessao_id = s.id and p.origem <> 'mesa') as contas
    from sessoes s
  )
  select jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'fuso', v_fuso,
    'sessoes', (select count(*) from sessoes),
    'vendido', coalesce((select sum(vendido) from por_pedido), 0),
    'recebido', coalesce((select sum(valor) from recebidos), 0),
    'contas', coalesce((select sum(contas) from contas_sessao), 0),
    'itens', coalesce((select sum(quantidade) from vendidos), 0),
    'taxas_entrega', coalesce((select sum(taxa_entrega) from validos), 0),
    'pedidos_cancelados', jsonb_build_object(
      'quantidade', (select count(*) from pedidos where status = 'cancelado'),
      'valor', coalesce((select sum(total) from pedidos where status = 'cancelado'), 0)
    ),
    'itens_cancelados', jsonb_build_object(
      'quantidade', coalesce((
        select sum(i.quantidade) from public.itens_pedido i join validos p on p.id = i.pedido_id
        where i.restaurante_id = p_restaurante_id and i.cancelado_em is not null
      ), 0),
      'valor', coalesce((
        select sum(i.total) from public.itens_pedido i join validos p on p.id = i.pedido_id
        where i.restaurante_id = p_restaurante_id and i.cancelado_em is not null
      ), 0)
    ),
    'estornos', jsonb_build_object(
      'quantidade', (select count(*) from pagamentos where estornado_em is not null),
      'valor', coalesce((select sum(valor) from pagamentos where estornado_em is not null), 0)
    ),
    'por_sessao', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'aberta_em', s.aberta_em,
        'vendido', coalesce((select sum(vendido) from por_pedido p where p.caixa_sessao_id = s.id), 0),
        'contas', (select contas from contas_sessao c where c.id = s.id)
      ) order by s.aberta_em)
      from sessoes s
    ), '[]'::jsonb),
    -- Dia da semana da noite (0 = domingo), com quantas noites para tirar a média.
    'por_dia_semana', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'noites', noites, 'vendido', vendido) order by dia)
      from (
        select extract(dow from s.aberta_em at time zone v_fuso)::int as dia,
          count(*) as noites,
          coalesce(sum((select sum(vendido) from por_pedido p where p.caixa_sessao_id = s.id)), 0) as vendido
        from sessoes s
        group by 1
      ) x
    ), '[]'::jsonb),
    -- Hora em que o pedido foi lançado (no fuso do restaurante).
    'por_hora', coalesce((
      select jsonb_agg(jsonb_build_object('hora', hora, 'pedidos', pedidos, 'vendido', vendido) order by hora)
      from (
        select extract(hour from p.criado_em at time zone v_fuso)::int as hora, count(*) as pedidos, sum(p.vendido) as vendido
        from por_pedido p
        group by 1
      ) x
    ), '[]'::jsonb),
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'pedidos', pedidos, 'vendido', vendido) order by vendido desc)
      from (
        select p.origem,
          case when p.origem = 'mesa' then count(distinct p.comanda_id) else count(*) end as pedidos,
          sum(p.vendido) as vendido
        from por_pedido p
        group by p.origem
      ) x
    ), '[]'::jsonb),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'quantidade', quantidade, 'valor', valor) order by valor desc)
      from (select forma, count(*) as quantidade, sum(valor) as valor from recebidos group by forma) x
    ), '[]'::jsonb),
    -- Por produto (o nome é o mais recente lançado; a categoria é a atual do produto).
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'produto_id', produto_id, 'nome', nome, 'categoria', categoria, 'quantidade', quantidade, 'total', total
      ) order by quantidade desc, total desc)
      from (
        select v.produto_id,
          (array_agg(v.nome_produto order by v.criado_em desc))[1] as nome,
          (select c.nome from public.produtos pr join public.categorias c on c.id = pr.categoria_id where pr.id = v.produto_id) as categoria,
          sum(v.quantidade) as quantidade,
          sum(v.total) as total
        from vendidos v
        group by v.produto_id
      ) x
    ), '[]'::jsonb),
    'bairros', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'pedidos', pedidos, 'vendido', vendido, 'taxas', taxas) order by pedidos desc, vendido desc)
      from (
        select coalesce(b.nome, initcap(nullif(btrim(p.bairro_texto), '')), 'Sem bairro') as nome, count(*) as pedidos, sum(p.vendido) as vendido, sum(p.taxa_entrega) as taxas
        from por_pedido p
        left join public.bairros_entrega b on b.id = p.bairro_id
        where p.origem = 'delivery'
        group by 1
      ) x
    ), '[]'::jsonb),
    'garcons', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'comandas', comandas, 'vendido', vendido, 'pessoas', pessoas) order by vendido desc)
      from (
        select coalesce(m.nome, 'Sem garçom') as nome, count(*) as comandas, sum(c.total) as vendido, sum(c.pessoas) as pessoas
        from comandas c
        left join public.membros m on m.id = c.garcom_id
        where c.status = 'fechada'
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;
