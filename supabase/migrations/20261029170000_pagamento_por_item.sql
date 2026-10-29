-- Pagamento por item (pedido do cliente em 29/10): quem paga pela calculadora "Por item" marca o que
-- consumiu; o pagamento guarda esses itens e a calculadora seguinte mostra só o que ainda não foi pago.
-- pagamentos.itens = [{item_id, quantidade}] (null = valor livre: tudo, por pessoa, digitado).
-- Estornar o pagamento libera os itens. Num pagamento combinado (várias formas), os itens ficam na primeira.

alter table public.pagamentos add column itens jsonb;

create or replace function rest_privado.pagamentos_antes_inserir()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status text;
  v_origem text;
  v_total integer;
  v_pago integer;
  v_ruim text;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);
  new.registrado_por := rest_privado.membro_atual(new.restaurante_id);
  if new.registrado_por is null then
    raise exception 'Usuário não é membro do restaurante.' using errcode = 'P0001';
  end if;

  -- for update: dois pagamentos simultâneos da mesma conta passam um de cada vez.
  if new.comanda_id is not null then
    select status, total into v_status, v_total
    from public.comandas
    where id = new.comanda_id and restaurante_id = new.restaurante_id
    for update;
    if v_status is null or v_status not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos where comanda_id = new.comanda_id and estornado_em is null;
  else
    select status, origem, total into v_status, v_origem, v_total
    from public.pedidos
    where id = new.pedido_id and restaurante_id = new.restaurante_id
    for update;
    if v_status is null or v_status = 'cancelado' then
      raise exception 'Pedido inválido ou cancelado.' using errcode = 'P0001';
    end if;
    if v_origem = 'mesa' then
      raise exception 'Pagamento de mesa deve ser registrado na comanda.' using errcode = 'P0001';
    end if;
    select coalesce(sum(valor), 0) into v_pago
    from public.pagamentos where pedido_id = new.pedido_id and estornado_em is null;
  end if;

  if v_pago >= v_total then
    raise exception 'Esta conta já está paga (alguém registrou o pagamento agora há pouco).' using errcode = 'P0001';
  end if;
  if new.valor > v_total - v_pago then
    raise exception 'Valor maior que o que falta (%). Confira os pagamentos já registrados.',
      rest_privado.texto_reais(v_total - v_pago) using errcode = 'P0001';
  end if;

  -- Itens pagos (só na mesa): da própria comanda, não cancelados e sem passar da quantidade lançada,
  -- somando o que outros pagamentos ativos já pagaram. A comanda já está travada acima.
  if new.itens is not null and jsonb_typeof(new.itens) = 'array' and jsonb_array_length(new.itens) = 0 then
    new.itens := null;
  end if;
  if new.itens is not null then
    if new.comanda_id is null then
      raise exception 'Itens pagos só valem na mesa.' using errcode = 'P0001';
    end if;
    if jsonb_typeof(new.itens) <> 'array' or jsonb_array_length(new.itens) > 200 then
      raise exception 'Itens do pagamento inválidos.' using errcode = 'P0001';
    end if;
    begin
      new.itens := (
        select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantidade', qtd) order by item_id)
        from (
          select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'quantidade')::integer)::integer as qtd
          from jsonb_array_elements(new.itens) as e
          group by 1
        ) x
      );
    exception when others then
      raise exception 'Itens do pagamento inválidos.' using errcode = 'P0001';
    end;

    select coalesce(i.nome_produto, 'item') into v_ruim
    from jsonb_to_recordset(new.itens) as n(item_id uuid, quantidade integer)
    left join public.itens_pedido i on i.id = n.item_id and i.restaurante_id = new.restaurante_id
    left join public.pedidos p on p.id = i.pedido_id
    where n.quantidade is null or n.quantidade < 1
      or i.id is null or i.cancelado_em is not null or p.comanda_id is distinct from new.comanda_id
      or n.quantidade + coalesce((
        select sum((pe ->> 'quantidade')::integer)
        from public.pagamentos pg, jsonb_array_elements(pg.itens) as pe
        where pg.comanda_id = new.comanda_id and pg.estornado_em is null and pg.itens is not null
          and (pe ->> 'item_id')::uuid = n.item_id
      ), 0) > i.quantidade
    limit 1;
    if found then
      raise exception '% já foi pago ou mudou. Confira a conta e marque de novo.', v_ruim using errcode = 'P0001';
    end if;
  end if;

  new.criado_em := now();
  new.estornado_em := null;
  new.estornado_por := null;
  new.motivo_estorno := null;
  return new;
end;
$function$;

create or replace function rest_privado.pagamentos_antes_atualizar()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if old.estornado_em is not null then
    raise exception 'Pagamento já estornado.' using errcode = 'P0001';
  end if;

  new.comanda_id := old.comanda_id;
  new.pedido_id := old.pedido_id;
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.valor := old.valor;
  new.forma := old.forma;
  new.itens := old.itens;
  new.registrado_por := old.registrado_por;
  new.criado_em := old.criado_em;

  if new.estornado_em is not null then
    if old.comanda_id is not null and exists (
      select 1 from public.comandas where id = old.comanda_id and status = 'fechada'
    ) then
      raise exception 'Comanda fechada: não é possível estornar.' using errcode = 'P0001';
    end if;
    new.motivo_estorno := nullif(trim(new.motivo_estorno), '');
    if new.motivo_estorno is null or length(new.motivo_estorno) < 3 then
      raise exception 'Informe o motivo do estorno.' using errcode = 'P0001';
    end if;
    new.estornado_em := now();
    new.estornado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.estornado_por := null;
    new.motivo_estorno := null;
  end if;
  return new;
end;
$function$;
