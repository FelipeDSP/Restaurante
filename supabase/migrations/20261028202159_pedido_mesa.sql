-- Pedido pelo QR code da mesa (pedido do chefe: "cardápio digital para atendimento presencial").
-- Opcional: o dono liga em Painel › Cadastro de mesas › QR code das mesas (restaurantes.pedido_mesa_qr).
-- Cada mesa tem o seu QR (mesas.qr_token, trocável). Com o pedido ligado, o cliente escolhe no celular
-- e o pedido vai direto para a comanda da mesa e para a cozinha (decisão do cliente em 28/10); se a
-- mesa está livre, ela abre sozinha, sem garçom (quem atende assume). Desligado ou caixa fechado, o QR
-- mostra só o cardápio. Pedido do cliente = origem 'mesa' com criado_por nulo.

alter table public.restaurantes add column pedido_mesa_qr boolean not null default false;
grant update (pedido_mesa_qr) on public.restaurantes to authenticated;

alter table public.mesas add column qr_token uuid not null default gen_random_uuid();
create unique index mesas_qr_token_idx on public.mesas (qr_token);
grant update (qr_token) on public.mesas to authenticated;

-- Cardápio do salão (tudo que está disponível no salão, inclusive o que não vai para o delivery),
-- no mesmo formato das opções do site (ids para escolher, mínimo/máximo, repetir).
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

revoke execute on function public.cardapio_salao_publico(uuid) from public;
grant execute on function public.cardapio_salao_publico(uuid) to anon, authenticated;

-- O que o QR da mesa mostra: a mesa, se dá para pedir agora e a conta aberta (quem está na mesa vê
-- o que já foi pedido). Nada de garçom, pagamentos ou dados de outras mesas.
create or replace function public.mesa_por_qr(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mesa record;
  v_comanda record;
begin
  select m.id, m.numero, m.restaurante_id, r.pedido_mesa_qr
  into v_mesa
  from public.mesas m
  join public.restaurantes r on r.id = m.restaurante_id
  where m.qr_token = p_token and m.ativa and r.ativo and r.excluido_em is null;
  if v_mesa.id is null then
    return null;
  end if;

  select id, subtotal, servico, couvert, total into v_comanda
  from public.comandas
  where restaurante_id = v_mesa.restaurante_id and mesa_id = v_mesa.id and status in ('aberta', 'conta_pedida');

  return jsonb_build_object(
    'restaurante_id', v_mesa.restaurante_id,
    'mesa', v_mesa.numero,
    'pode_pedir', v_mesa.pedido_mesa_qr and exists (
      select 1 from public.caixa_sessoes s where s.restaurante_id = v_mesa.restaurante_id and s.fechada_em is null
    ),
    'conta', case when v_comanda.id is null then null else jsonb_build_object(
      'subtotal', v_comanda.subtotal,
      'servico', v_comanda.servico,
      'couvert', v_comanda.couvert,
      'total', v_comanda.total,
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nome', i.nome_produto,
          'quantidade', i.quantidade,
          'adicionais', (select string_agg(a ->> 'nome', ', ') from jsonb_array_elements(i.adicionais) a),
          'total', i.total
        ) order by i.criado_em)
        from public.itens_pedido i
        join public.pedidos p on p.id = i.pedido_id
        where p.comanda_id = v_comanda.id and p.status <> 'cancelado' and i.cancelado_em is null
      ), '[]'::jsonb)
    ) end
  );
end;
$$;

revoke execute on function public.mesa_por_qr(uuid) from public;
grant execute on function public.mesa_por_qr(uuid) to anon, authenticated;

-- Pedido do cliente pelo QR: as mesmas regras do lançamento do garçom (preço, opções, rota de preparo
-- e "pra viagem" pelos triggers; chave do envio contra toque duplo; total que a pessoa viu).
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
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais)
    values (v_mesa.restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, v_observacao, coalesce(v_item -> 'adicionais', '[]'::jsonb));
  end loop;

  select subtotal into v_subtotal from public.pedidos where id = v_pedido_id;
  if p_total_esperado is not null and p_total_esperado <> v_subtotal then
    raise exception 'Algum preço mudou: o total agora é %. Confira e envie de novo. (precos_mudaram)',
      rest_privado.texto_reais(v_subtotal) using errcode = 'P0001';
  end if;

  return jsonb_build_object('pedido_id', v_pedido_id, 'numero', v_numero);
end;
$$;

revoke execute on function public.pedir_pela_mesa(uuid, jsonb, uuid, integer) from public;
grant execute on function public.pedir_pela_mesa(uuid, jsonb, uuid, integer) to anon, authenticated;

-- Comanda: o garçom assume a mesa que o cliente abriu pelo QR (sem garçom).

CREATE OR REPLACE FUNCTION rest_privado.comandas_antes_atualizar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_subtotal integer;
  v_pago integer;
begin
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.aberta_em := old.aberta_em;
  new.servico_percentual := old.servico_percentual;
  new.couvert_unitario := old.couvert_unitario;

  select coalesce(sum(total), 0) into v_subtotal
  from public.pedidos
  where comanda_id = new.id and status <> 'cancelado';

  if old.status in ('fechada', 'cancelada') then
    if new.status <> old.status or v_subtotal <> old.subtotal or new.mesa_id <> old.mesa_id then
      raise exception 'Comanda já encerrada.' using errcode = 'P0001';
    end if;
    new := old;
    return new;
  end if;

  -- Mesa aberta pelo cliente (QR code) fica sem garçom: quem atende pode assumir.
  if new.garcom_id is distinct from old.garcom_id
     and (select auth.uid()) is not null
     and not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar'])
     and not (old.garcom_id is null and new.garcom_id = rest_privado.membro_atual(new.restaurante_id)) then
    raise exception 'Sem permissão para trocar o garçom da mesa.' using errcode = 'P0001';
  end if;

  -- Sem percentual/valor configurado não há o que cobrar.
  new.cobrar_servico := new.cobrar_servico and new.servico_percentual > 0;
  new.cobrar_couvert := new.cobrar_couvert and new.couvert_unitario > 0;

  new.subtotal := v_subtotal;
  new.servico := case when new.cobrar_servico then round(v_subtotal * new.servico_percentual / 100.0)::integer else 0 end;
  new.couvert := case when new.cobrar_couvert then new.couvert_unitario * coalesce(new.pessoas, 0) else 0 end;
  new.total := new.subtotal + new.servico + new.couvert;

  if new.total < old.total then
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos where comanda_id = new.id and estornado_em is null;
    if v_pago > new.total then
      raise exception 'O total ficaria menor que o já pago. Estorne um pagamento antes.' using errcode = 'P0001';
    end if;
  end if;

  if new.mesa_id <> old.mesa_id and not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  if new.status = 'fechada' then
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos
    where comanda_id = new.id and estornado_em is null;

    if v_pago < new.total then
      raise exception 'Comanda não quitada: faltam % centavos.', new.total - v_pago using errcode = 'P0001';
    end if;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
  elsif new.status = 'cancelada' then
    if not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar']) then
      raise exception 'Sem permissão para cancelar a comanda.' using errcode = 'P0001';
    end if;
    if v_subtotal <> 0 then
      raise exception 'Cancele os itens antes de cancelar a comanda.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pagamentos where comanda_id = new.id and estornado_em is null) then
      raise exception 'Estorne os pagamentos antes de cancelar a comanda.' using errcode = 'P0001';
    end if;
    new.servico := 0;
    new.couvert := 0;
    new.total := 0;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.fechada_em := null;
    new.fechada_por := null;
  end if;
  return new;
end;
$$;
