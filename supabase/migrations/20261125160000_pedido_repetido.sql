-- Reenvio do mesmo lote: avisar que o pedido já tinha entrado.
--
-- A chave do envio agora é guardada no aparelho, então o reenvio depois de uma resposta
-- perdida cai na idempotência e não lança em dobro. Faltava dizer isso a quem enviou: a
-- tela mostrava "Pedido nº X enviado", como se tivesse lançado agora. O retorno passa a
-- marcar `repetido`, e só isso muda nesta função.

create or replace function public.lancar_itens_comanda(
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
  -- `repetido` deixa a tela dizer que o pedido já tinha entrado, em vez de "enviado".
  if p_lote is not null then
    select jsonb_build_object('pedido_id', id, 'numero', numero, 'repetido', true) into v_existente
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

