-- O cliente do delivery cancela o próprio pedido enquanto o restaurante ainda não aceitou
-- (status "recebido"). Depois do aceite, só o restaurante cancela (o cliente fala pela conversa).
-- Sem conta: o id do pedido vale como senha, como no acompanhamento.

alter table public.pedidos add column cancelado_pelo_cliente boolean not null default false;

-- Marca da transação aberta só pela RPC abaixo.
create or replace function rest_privado.cancelamento_do_cliente(p_pedido_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('rest.cancelamento_cliente', true), '') = p_pedido_id::text;
$$;

-- Só o banco define cancelado_pelo_cliente (no cancelamento feito pela RPC).
create or replace function rest_privado.pedidos_cancelado_pelo_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.cancelado_pelo_cliente := false;
  elsif old.status <> 'cancelado' and new.status = 'cancelado' then
    new.cancelado_pelo_cliente := rest_privado.cancelamento_do_cliente(new.id);
  else
    new.cancelado_pelo_cliente := old.cancelado_pelo_cliente;
  end if;
  return new;
end;
$$;

create trigger t12_cancelado_pelo_cliente
  before insert or update on public.pedidos
  for each row execute function rest_privado.pedidos_cancelado_pelo_cliente();

-- O cliente logado (conta do delivery, sem permissão de equipe) também pode cancelar pela RPC.
create or replace function rest_privado.pedidos_campos_fixos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rest_privado.edicao_autorizada(new.id) and (
     new.taxa_entrega is distinct from old.taxa_entrega
     or new.bairro_id is distinct from old.bairro_id
     or new.endereco is distinct from old.endereco
     or new.cliente_nome is distinct from old.cliente_nome
     or new.cliente_telefone is distinct from old.cliente_telefone
     or new.forma_pagamento_prevista is distinct from old.forma_pagamento_prevista
     or new.troco_para is distinct from old.troco_para
     or new.chave_idempotencia is distinct from old.chave_idempotencia
     or new.observacao is distinct from old.observacao
     -- cliente_id só pode sumir (conta do cliente excluída: a FK faz "set null").
     or (new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null)) then
    raise exception 'Os dados do pedido não podem ser alterados.' using errcode = 'P0001';
  end if;
  -- Nem a edição troca a chave do envio nem o cliente da conta.
  if new.chave_idempotencia is distinct from old.chave_idempotencia
     or (new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null) then
    raise exception 'Os dados do pedido não podem ser alterados.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if new.origem = 'delivery'
       and (select auth.uid()) is not null
       and not (old.status = 'em_preparo' and new.status = 'pronto')
       and not (old.status = 'recebido' and new.status = 'cancelado' and rest_privado.cancelamento_do_cliente(new.id))
       and not rest_privado.tem_permissao(new.restaurante_id, array['delivery']) then
      raise exception 'Sem permissão para mudar o andamento do delivery.' using errcode = 'P0001';
    end if;

    if new.status = 'cancelado' and exists (
      select 1 from public.pagamentos where pedido_id = new.id and estornado_em is null
    ) then
      raise exception 'Estorne o pagamento antes de cancelar o pedido.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.cliente_cancelar_pedido(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
begin
  select p.id, p.status into v_pedido
  from public.pedidos p join public.restaurantes r on r.id = p.restaurante_id
  where p.id = p_pedido_id and p.origem = 'delivery' and r.ativo and r.excluido_em is null
  for update of p;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_pedido.status = 'cancelado' then
    return; -- já cancelado (toque repetido ou rede caiu depois de gravar)
  end if;
  if v_pedido.status <> 'recebido' then
    raise exception 'O restaurante já aceitou seu pedido. Para cancelar, fale com o restaurante.' using errcode = 'P0001';
  end if;

  perform set_config('rest.cancelamento_cliente', p_pedido_id::text, true);
  update public.pedidos
  set status = 'cancelado',
      motivo_cancelamento = 'Cancelado pelo cliente' || case when v_motivo <> '' then ': ' || v_motivo else '' end
  where id = p_pedido_id;
  perform set_config('rest.cancelamento_cliente', '', true);
end;
$$;

revoke all on function public.cliente_cancelar_pedido(uuid, text) from public;
grant execute on function public.cliente_cancelar_pedido(uuid, text) to anon, authenticated;

-- Acompanhamento: diz se foi o cliente que cancelou.
create or replace function public.consultar_pedido_publico(p_pedido_id uuid)
returns jsonb
language sql
stable security definer
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
    'desconto', p.desconto,
    'cupom_codigo', p.cupom_codigo,
    'total', p.total,
    'forma_pagamento_prevista', p.forma_pagamento_prevista,
    'troco_para', p.troco_para,
    'motivo_cancelamento', case when p.status = 'cancelado' then p.motivo_cancelamento end,
    'cancelado_pelo_cliente', p.cancelado_pelo_cliente,
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
