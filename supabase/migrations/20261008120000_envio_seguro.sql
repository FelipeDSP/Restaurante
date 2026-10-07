-- Envio repetido não duplica pedido, e preço que mudou no meio do caminho não é cobrado sem avisar.
--
-- chave_idempotencia: uuid gerado no aparelho a cada envio. Se a resposta se perde na rede e o
-- cliente (ou o garçom) toca de novo, a RPC devolve o pedido já criado em vez de criar outro.
-- p_total_esperado: o total que a pessoa viu na tela; diferente do calculado -> recusa e avisa.

alter table public.pedidos add column chave_idempotencia uuid;
create unique index pedidos_restaurante_chave_idempotencia_idx
  on public.pedidos (restaurante_id, chave_idempotencia) where chave_idempotencia is not null;

drop function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text);
drop function public.lancar_itens_comanda(uuid, jsonb);

create function public.criar_pedido_delivery(
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
    taxa_entrega, forma_pagamento_prevista, troco_para, observacao, chave_idempotencia
  ) values (
    p_restaurante_id, 'delivery', btrim(p_cliente_nome), v_telefone, p_endereco, p_bairro_id,
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

-- p_itens: [{"produto_id", "quantidade", "observacao"?, "adicionais"?: [uuid], "para_viagem"?: bool}, ...]
create function public.lancar_itens_comanda(
  p_comanda_id uuid,
  p_itens jsonb,
  p_lote uuid default null,
  p_total_esperado integer default null
)
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
  v_existente jsonb;
  v_subtotal integer;
begin
  -- Pela RLS, só encontra comandas do restaurante de quem chama.
  select restaurante_id into v_restaurante_id from public.comandas where id = p_comanda_id;
  if v_restaurante_id is null then
    raise exception 'Comanda não encontrada.' using errcode = 'P0001';
  end if;

  -- Mesmo lote enviado de novo (toque duplo, resposta perdida): não lança em dobro.
  if p_lote is not null then
    select jsonb_build_object('pedido_id', id, 'numero', numero) into v_existente
    from public.pedidos where restaurante_id = v_restaurante_id and chave_idempotencia = p_lote;
    if v_existente is not null then
      return v_existente;
    end if;
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item para lançar.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'Itens demais de uma vez.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (restaurante_id, origem, comanda_id, chave_idempotencia)
  values (v_restaurante_id, 'mesa', p_comanda_id, p_lote)
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

  select subtotal into v_subtotal from public.pedidos where id = v_pedido_id;
  if p_total_esperado is not null and p_total_esperado <> v_subtotal then
    raise exception 'Algum preço mudou: o total destes itens agora é %. Confira e envie de novo. (precos_mudaram)',
      rest_privado.texto_reais(v_subtotal) using errcode = 'P0001';
  end if;

  return jsonb_build_object('pedido_id', v_pedido_id, 'numero', v_numero);
end;
$$;

revoke all on function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer) from public;
grant execute on function public.criar_pedido_delivery(uuid, text, text, uuid, jsonb, text, jsonb, integer, text, uuid, integer) to anon, authenticated;
revoke all on function public.lancar_itens_comanda(uuid, jsonb, uuid, integer) from public, anon;
grant execute on function public.lancar_itens_comanda(uuid, jsonb, uuid, integer) to authenticated;
