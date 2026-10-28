-- "Trazer agora ou junto com a comida" (pedido do cliente em 28/10). No pedido pela mesa, o que não
-- passa pela cozinha (ex.: bebida) pode ir junto com a comida em vez de na hora; o garçom vê
-- "Levar agora" ou "Levar com a comida" e o item acompanha o andamento da comida.

alter table public.itens_pedido add column servir_com_comida boolean not null default false;

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
      )
    ) as categoria
    from public.categorias cat
    where cat.restaurante_id = p_restaurante_id
      and cat.ativa
      and rest_privado.restaurante_publico(p_restaurante_id)
      and exists (
        select 1 from public.produtos p
        where p.categoria_id = cat.id and p.restaurante_id = p_restaurante_id and p.disponivel
      )
  ) c;
$$;

create or replace function public.pedir_pela_mesa(p_token uuid, p_itens jsonb, p_lote uuid, p_total_esperado integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesa record;
  v_comanda_id uuid;
  v_pedido_id uuid;
  v_numero integer;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade integer;
  v_observacao text;
  v_existente jsonb;
  v_subtotal integer;
begin
  select m.id, m.restaurante_id, r.pedido_mesa_qr
  into v_mesa
  from public.mesas m
  join public.restaurantes r on r.id = m.restaurante_id
  where m.qr_token = p_token and m.ativa and r.ativo and r.excluido_em is null;
  if v_mesa.id is null then
    raise exception 'Este QR code não vale mais. Chame o garçom.' using errcode = 'P0001';
  end if;
  if not v_mesa.pedido_mesa_qr then
    raise exception 'Os pedidos por aqui estão desligados. Peça ao garçom.' using errcode = 'P0001';
  end if;
  if p_lote is null then
    raise exception 'Envio inválido.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = v_mesa.restaurante_id and fechada_em is null) then
    raise exception 'Ainda não estamos recebendo pedidos por aqui. Peça ao garçom.' using errcode = 'P0001';
  end if;

  select jsonb_build_object('pedido_id', id, 'numero', numero) into v_existente
  from public.pedidos where restaurante_id = v_mesa.restaurante_id and chave_idempotencia = p_lote;
  if v_existente is not null then
    return v_existente;
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item no pedido.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 30 then
    raise exception 'Itens demais de uma vez.' using errcode = 'P0001';
  end if;

  -- Mesa livre: abre a comanda (sem garçom; o caixa precisa estar aberto, o trigger confere).
  select id into v_comanda_id from public.comandas
  where restaurante_id = v_mesa.restaurante_id and mesa_id = v_mesa.id and status in ('aberta', 'conta_pedida')
  for update;
  if v_comanda_id is null then
    begin
      insert into public.comandas (restaurante_id, mesa_id) values (v_mesa.restaurante_id, v_mesa.id)
      returning id into v_comanda_id;
    exception when unique_violation then
      -- Outro celular da mesma mesa abriu agora.
      select id into v_comanda_id from public.comandas
      where restaurante_id = v_mesa.restaurante_id and mesa_id = v_mesa.id and status in ('aberta', 'conta_pedida');
    end;
  end if;

  -- Contra brincadeira com foto do QR: no máximo 8 pedidos do cliente por mesa em 10 minutos.
  if (select count(*) from public.pedidos
      where comanda_id = v_comanda_id and criado_por is null and criado_em > now() - interval '10 minutes') >= 8 then
    raise exception 'Muitos pedidos seguidos desta mesa. Chame o garçom.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (restaurante_id, origem, comanda_id, chave_idempotencia)
  values (v_mesa.restaurante_id, 'mesa', v_comanda_id, p_lote)
  returning id, numero into v_pedido_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    begin
      v_produto_id := (v_item ->> 'produto_id')::uuid;
      v_quantidade := (v_item ->> 'quantidade')::integer;
    exception when others then
      raise exception 'Item inválido.' using errcode = 'P0001';
    end;
    v_observacao := nullif(btrim(coalesce(v_item ->> 'observacao', '')), '');
    if v_quantidade is null or v_quantidade not between 1 and 20 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    if length(v_observacao) > 200 then
      raise exception 'Observação muito longa.' using errcode = 'P0001';
    end if;

    -- Nome, preço, opções, rota e "pra viagem" vêm do cadastro pelo trigger.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais, servir_com_comida)
    values (v_mesa.restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, v_observacao, coalesce(v_item -> 'adicionais', '[]'::jsonb),
      coalesce((v_item ->> 'com_a_comida')::boolean, false));
  end loop;

  select subtotal into v_subtotal from public.pedidos where id = v_pedido_id;
  if p_total_esperado is not null and p_total_esperado <> v_subtotal then
    raise exception 'Algum preço mudou: o total agora é %. Confira e envie de novo. (precos_mudaram)',
      rest_privado.texto_reais(v_subtotal) using errcode = 'P0001';
  end if;

  return jsonb_build_object('pedido_id', v_pedido_id, 'numero', v_numero);
end;
$$;

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
