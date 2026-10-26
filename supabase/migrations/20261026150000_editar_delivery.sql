-- Editar pedido de delivery (pedido do chefe: "no delivery tem que possibilitar edição no pedido").
-- Só dono e caixa, enquanto o pedido não foi entregue nem cancelado, e sempre pela função
-- editar_pedido_delivery: ela valida, recalcula e registra cada mudança em pedidos_alteracoes.
-- Fora dela, os dados do pedido e os itens do delivery continuam travados.

-- 1) Histórico das alterações (quem, quando, o quê).
create table public.pedidos_alteracoes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  pedido_id uuid not null,
  membro_id uuid,
  descricao text not null check (length(descricao) between 1 and 500),
  criado_em timestamptz not null default now(),
  foreign key (restaurante_id, pedido_id) references public.pedidos (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, membro_id) references public.membros (restaurante_id, id)
);

create index pedidos_alteracoes_restaurante_pedido on public.pedidos_alteracoes (restaurante_id, pedido_id, criado_em);

alter table public.pedidos_alteracoes enable row level security;
revoke all on public.pedidos_alteracoes from anon, authenticated;
grant select on public.pedidos_alteracoes to authenticated;

create policy pedidos_alteracoes_ler on public.pedidos_alteracoes
  for select to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));

-- 2) Pedido: os campos travados só mudam dentro da edição autorizada (marcada na transação pela
--    função abaixo; a API não tem como marcar isso sozinha).
create or replace function rest_privado.edicao_autorizada(p_pedido_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('rest.edicao_pedido', true), '') = p_pedido_id::text;
$$;

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
       and not rest_privado.tem_papel(new.restaurante_id, array['dono', 'caixa']) then
      raise exception 'Apenas dono ou caixa mudam o andamento do delivery.' using errcode = 'P0001';
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

-- 3) Itens do delivery: entram na criação do pedido (mesma transação) ou pela edição; mudam só
--    pela edição. Antes, qualquer membro (até a cozinha) podia cancelar itens direto pela API.
create or replace function rest_privado.itens_pedido_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is not null then
    raise exception 'Item já cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and status = 'cancelado') then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and origem = 'delivery')
     and not rest_privado.edicao_autorizada(old.pedido_id) then
    raise exception 'Os itens do delivery só mudam pela edição do pedido.' using errcode = 'P0001';
  end if;

  -- Para trocar as opções, cancela o item e lança de novo. "Pra viagem" pode mudar.
  new.pedido_id := old.pedido_id;
  new.produto_id := old.produto_id;
  new.nome_produto := old.nome_produto;
  new.preco_unitario := old.preco_unitario;
  new.etapas := old.etapas;
  new.adicionais := old.adicionais;
  new.preco_adicionais := old.preco_adicionais;
  new.criado_em := old.criado_em;
  new.para_viagem := coalesce(new.para_viagem, old.para_viagem);

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

-- 4) A edição. p_campos traz só o que mudou (cliente_nome, cliente_telefone, endereco, bairro_id,
--    taxa_entrega, forma_pagamento_prevista, troco_para, observacao); p_remover são ids de itens;
--    p_adicionar é a mesma lista de itens do lançamento ([{produto_id, quantidade, observacao, adicionais}]).
create or replace function public.editar_pedido_delivery(
  p_pedido_id uuid,
  p_campos jsonb default '{}'::jsonb,
  p_remover uuid[] default '{}',
  p_adicionar jsonb default '[]'::jsonb,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_novo public.pedidos;
  v_membro uuid;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Alterado pelo restaurante');
  v_log text[] := '{}';
  v_item jsonb;
  v_nome text;
  v_qtd integer;
  v_endereco jsonb;
  v_chave text;
  v_pago integer;
  v_removido record;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if v_pedido.id is null or v_pedido.origem <> 'delivery'
     or not rest_privado.tem_papel(v_pedido.restaurante_id, array['dono', 'caixa']) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_pedido.status in ('entregue', 'cancelado') then
    raise exception 'Pedido já finalizado: não dá mais para editar.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_campos, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_adicionar, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_adicionar, '[]'::jsonb)) > 30 or coalesce(array_length(p_remover, 1), 0) > 50 then
    raise exception 'Dados inválidos.' using errcode = 'P0001';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'Motivo muito longo.' using errcode = 'P0001';
  end if;

  v_membro := rest_privado.membro_atual(v_pedido.restaurante_id);
  perform set_config('rest.edicao_pedido', p_pedido_id::text, true);
  v_novo := v_pedido;

  -- Campos do pedido.
  if p_campos ? 'cliente_nome' then
    v_novo.cliente_nome := btrim(p_campos ->> 'cliente_nome');
    if length(coalesce(v_novo.cliente_nome, '')) not between 2 and 120 then
      raise exception 'Informe o nome do cliente.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'cliente_telefone' then
    v_novo.cliente_telefone := regexp_replace(coalesce(p_campos ->> 'cliente_telefone', ''), '\D', '', 'g');
    if length(v_novo.cliente_telefone) not between 10 and 13 then
      raise exception 'Telefone inválido.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'endereco' then
    if jsonb_typeof(p_campos -> 'endereco') <> 'object' then
      raise exception 'Endereço inválido.' using errcode = 'P0001';
    end if;
    -- Só as chaves conhecidas, texto curto; mantém as que não vieram.
    v_endereco := coalesce(v_pedido.endereco, '{}'::jsonb);
    foreach v_chave in array array['rua', 'numero', 'complemento', 'referencia', 'bairro', 'cep', 'cidade', 'uf'] loop
      if (p_campos -> 'endereco') ? v_chave then
        if length(coalesce(p_campos -> 'endereco' ->> v_chave, '')) > 200 then
          raise exception 'Endereço muito longo.' using errcode = 'P0001';
        end if;
        v_endereco := case
          when coalesce(btrim(p_campos -> 'endereco' ->> v_chave), '') = '' then v_endereco - v_chave
          else jsonb_set(v_endereco, array[v_chave], to_jsonb(btrim(p_campos -> 'endereco' ->> v_chave)))
        end;
      end if;
    end loop;
    if coalesce(v_endereco ->> 'rua', '') = '' or coalesce(v_endereco ->> 'numero', '') = '' then
      raise exception 'Informe rua e número.' using errcode = 'P0001';
    end if;
    v_novo.endereco := v_endereco;
  end if;
  if p_campos ? 'bairro_id' then
    v_novo.bairro_id := nullif(p_campos ->> 'bairro_id', '')::uuid;
    if v_novo.bairro_id is not null and not exists (
      select 1 from public.bairros_entrega where id = v_novo.bairro_id and restaurante_id = v_pedido.restaurante_id and ativo
    ) then
      raise exception 'Bairro inválido.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'taxa_entrega' then
    v_novo.taxa_entrega := (p_campos ->> 'taxa_entrega')::integer;
    if v_novo.taxa_entrega is null or v_novo.taxa_entrega not between 0 and 100000 then
      raise exception 'Taxa de entrega inválida.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'forma_pagamento_prevista' then
    v_novo.forma_pagamento_prevista := p_campos ->> 'forma_pagamento_prevista';
    if v_novo.forma_pagamento_prevista not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
      raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'troco_para' then
    v_novo.troco_para := nullif(p_campos ->> 'troco_para', '')::integer;
  end if;
  if v_novo.forma_pagamento_prevista <> 'dinheiro' then
    v_novo.troco_para := null;
  end if;
  if p_campos ? 'observacao' then
    v_novo.observacao := nullif(btrim(p_campos ->> 'observacao'), '');
    if length(coalesce(v_novo.observacao, '')) > 500 then
      raise exception 'Observação muito longa.' using errcode = 'P0001';
    end if;
  end if;

  if v_novo.cliente_nome is distinct from v_pedido.cliente_nome then
    v_log := v_log || format('Nome: %s → %s', v_pedido.cliente_nome, v_novo.cliente_nome);
  end if;
  if v_novo.cliente_telefone is distinct from v_pedido.cliente_telefone then
    v_log := v_log || format('Telefone: %s → %s', v_pedido.cliente_telefone, v_novo.cliente_telefone);
  end if;
  if v_novo.endereco is distinct from v_pedido.endereco or v_novo.bairro_id is distinct from v_pedido.bairro_id then
    v_log := v_log || 'Endereço alterado'::text;
  end if;
  if v_novo.taxa_entrega is distinct from v_pedido.taxa_entrega then
    v_log := v_log || format('Taxa de entrega: R$ %s → R$ %s',
      replace(to_char(v_pedido.taxa_entrega / 100.0, 'FM999990.00'), '.', ','), replace(to_char(v_novo.taxa_entrega / 100.0, 'FM999990.00'), '.', ','));
  end if;
  if v_novo.forma_pagamento_prevista is distinct from v_pedido.forma_pagamento_prevista
     or v_novo.troco_para is distinct from v_pedido.troco_para then
    v_log := v_log || 'Pagamento alterado'::text;
  end if;
  if v_novo.observacao is distinct from v_pedido.observacao then
    v_log := v_log || 'Observação alterada'::text;
  end if;

  update public.pedidos
  set cliente_nome = v_novo.cliente_nome,
      cliente_telefone = v_novo.cliente_telefone,
      endereco = v_novo.endereco,
      bairro_id = v_novo.bairro_id,
      taxa_entrega = v_novo.taxa_entrega,
      forma_pagamento_prevista = v_novo.forma_pagamento_prevista,
      troco_para = v_novo.troco_para,
      observacao = v_novo.observacao
  where id = p_pedido_id;

  -- Itens que saem.
  for v_removido in
    update public.itens_pedido
    set cancelado_em = now(), motivo_cancelamento = v_motivo
    where pedido_id = p_pedido_id and id = any (coalesce(p_remover, '{}')) and cancelado_em is null
    returning quantidade, nome_produto
  loop
    v_log := v_log || format('Removido: %s× %s', v_removido.quantidade, v_removido.nome_produto);
  end loop;

  -- Itens que entram (preço, opções e rota vêm do cadastro, pelo trigger).
  for v_item in select * from jsonb_array_elements(coalesce(p_adicionar, '[]'::jsonb)) loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd not between 1 and 99 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    if length(coalesce(v_item ->> 'observacao', '')) > 300 then
      raise exception 'Observação do item muito longa.' using errcode = 'P0001';
    end if;
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais)
    values (v_pedido.restaurante_id, p_pedido_id, (v_item ->> 'produto_id')::uuid, '', 0, v_qtd,
            nullif(btrim(v_item ->> 'observacao'), ''), coalesce(v_item -> 'adicionais', '[]'::jsonb))
    returning nome_produto into v_nome;
    v_log := v_log || format('Adicionado: %s× %s', v_qtd, v_nome);
  end loop;

  if not exists (select 1 from public.itens_pedido where pedido_id = p_pedido_id and cancelado_em is null) then
    raise exception 'O pedido precisa ter pelo menos um item. Para desistir, cancele o pedido.' using errcode = 'P0001';
  end if;

  select * into v_novo from public.pedidos where id = p_pedido_id;
  if v_novo.forma_pagamento_prevista = 'dinheiro' and v_novo.troco_para is not null and v_novo.troco_para < v_novo.total then
    raise exception 'O troco precisa ser para um valor maior que o total (R$ %).',
      replace(to_char(v_novo.total / 100.0, 'FM999990.00'), '.', ',') using errcode = 'P0001';
  end if;
  select coalesce(sum(valor), 0) into v_pago from public.pagamentos where pedido_id = p_pedido_id and estornado_em is null;
  if v_pago > v_novo.total then
    raise exception 'O total ficaria menor que o já pago. Estorne o pagamento antes.' using errcode = 'P0001';
  end if;

  if array_length(v_log, 1) is null then
    raise exception 'Nada foi alterado.' using errcode = 'P0001';
  end if;
  insert into public.pedidos_alteracoes (restaurante_id, pedido_id, membro_id, descricao)
  select v_pedido.restaurante_id, p_pedido_id, v_membro, linha from unnest(v_log) as linha;

  perform set_config('rest.edicao_pedido', '', true);
  return jsonb_build_object('total', v_novo.total, 'alteracoes', to_jsonb(v_log));
end;
$$;

revoke execute on function public.editar_pedido_delivery(uuid, jsonb, uuid[], jsonb, text) from public, anon;
grant execute on function public.editar_pedido_delivery(uuid, jsonb, uuid[], jsonb, text) to authenticated;
