-- App do garçom: lançamento de itens numa transação e pagamentos em tempo real.

-- Cria um pedido de mesa com seus itens de uma vez (tudo ou nada).
-- security invoker: roda com a RLS de quem chama; preços e totais continuam vindo dos triggers.
-- p_itens: [{"produto_id": uuid, "quantidade": int, "observacao": text?}, ...]
create function public.lancar_itens_comanda(p_comanda_id uuid, p_itens jsonb)
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

    -- Nome e preço são preenchidos pelo trigger a partir do cadastro.
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao)
    values (v_restaurante_id, v_pedido_id, v_produto_id, '', 0, v_quantidade, v_observacao);
  end loop;

  return jsonb_build_object('pedido_id', v_pedido_id, 'numero', v_numero);
end;
$$;

revoke all on function public.lancar_itens_comanda(uuid, jsonb) from public, anon;
grant execute on function public.lancar_itens_comanda(uuid, jsonb) to authenticated;

-- Pagamento registrado pelo caixa aparece na hora para o garçom (e vice-versa).
alter publication supabase_realtime add table public.pagamentos;
