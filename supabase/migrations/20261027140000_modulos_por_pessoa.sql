-- Módulos por pessoa (pedido do chefe: "usuários com liberação de módulos — caixa, delivery, app do
-- garçom, comandas — para o dono liberar por pessoa e não apenas por perfil").
-- O papel continua dizendo quem é dono; para o resto da equipe quem manda são os módulos:
--   caixa     abrir/fechar caixa, sangria/suprimento, estorno, impressoras
--   delivery  andamento, edição e entregador do delivery; clientes e cupons
--   comandas  comandas no painel: trocar o garçom, cancelar comanda, abrir mesa em nome de outro
--   garcom    app do garçom
--   cozinha   tela da cozinha
-- O dono tem todos, sempre. O papel vira o atalho do cadastro (e o nome mostrado).

alter table public.membros
  add column modulos text[] not null default '{}'
  check (modulos <@ array['caixa', 'delivery', 'comandas', 'garcom', 'cozinha']);

-- Quem já existe fica como estava: caixa com tudo da operação; garçom e cozinha só com a sua área.
update public.membros set modulos = case papel
  when 'caixa' then array['caixa', 'comandas', 'cozinha', 'delivery', 'garcom']
  when 'garcom' then array['garcom']
  when 'cozinha' then array['cozinha']
  else '{}'::text[]
end;

-- Dono não tem lista (tem tudo). Cadastro sem módulos (inserts antigos): os de costume do papel.
create or replace function rest_privado.membros_modulos_padrao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.papel = 'dono' then
    new.modulos := '{}';
  elsif cardinality(new.modulos) = 0 then
    new.modulos := case new.papel
      when 'caixa' then array['caixa', 'comandas', 'cozinha', 'delivery', 'garcom']
      when 'garcom' then array['garcom']
      when 'cozinha' then array['cozinha']
      else '{}'::text[]
    end;
  end if;
  new.modulos := array(select distinct x from unnest(new.modulos) as x order by 1);
  return new;
end;
$$;

create trigger t02_modulos_padrao
before insert or update of papel, modulos on public.membros
for each row execute function rest_privado.membros_modulos_padrao();

grant update (modulos) on public.membros to authenticated;

-- Membro ativo com um dos módulos (o dono tem todos).
create function rest_privado.tem_modulo(p_restaurante_id uuid, p_modulos text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membros m
    join public.restaurantes r on r.id = m.restaurante_id
    where m.restaurante_id = p_restaurante_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and (m.papel = 'dono' or m.modulos && p_modulos)
      and r.excluido_em is null
  );
$$;

revoke all on function rest_privado.tem_modulo(uuid, text[]) from public, anon;
grant execute on function rest_privado.tem_modulo(uuid, text[]) to authenticated;
revoke all on function rest_privado.membros_modulos_padrao() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funções: "dono ou caixa" vira o módulo da tarefa.
-- ---------------------------------------------------------------------------

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
       and not rest_privado.tem_modulo(new.restaurante_id, array['delivery']) then
      raise exception 'Sem acesso ao delivery para mudar o andamento.' using errcode = 'P0001';
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
     or not rest_privado.tem_modulo(v_pedido.restaurante_id, array['delivery']) then
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

create or replace function rest_privado.comandas_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  if new.garcom_id is distinct from old.garcom_id
     and (select auth.uid()) is not null
     and not rest_privado.tem_modulo(new.restaurante_id, array['comandas']) then
    raise exception 'Sem acesso a comandas para trocar o garçom da mesa.' using errcode = 'P0001';
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
    if not rest_privado.tem_modulo(new.restaurante_id, array['comandas']) then
      raise exception 'Sem acesso a comandas para cancelar a comanda.' using errcode = 'P0001';
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

create or replace function rest_privado.comandas_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid := rest_privado.membro_atual(new.restaurante_id);
  v_r record;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  if not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  -- Quem só atende mesas abre em seu próprio nome; quem cuida das comandas pode indicar o garçom.
  if (select auth.uid()) is not null and not rest_privado.tem_modulo(new.restaurante_id, array['comandas']) then
    new.garcom_id := v_membro;
  else
    new.garcom_id := coalesce(new.garcom_id, v_membro);
  end if;

  -- Serviço e couvert do momento em que a mesa abre.
  select servico_percentual, couvert_valor, couvert_dias, fuso_horario into v_r
  from public.restaurantes where id = new.restaurante_id;
  new.servico_percentual := v_r.servico_percentual;
  new.cobrar_servico := v_r.servico_percentual > 0;
  new.couvert_unitario := v_r.couvert_valor;
  new.cobrar_couvert := v_r.couvert_valor > 0
    and extract(dow from now() at time zone v_r.fuso_horario)::smallint = any (v_r.couvert_dias);

  new.status := 'aberta';
  new.subtotal := 0;
  new.servico := 0;
  new.couvert := case when new.cobrar_couvert then new.couvert_unitario * coalesce(new.pessoas, 0) else 0 end;
  new.total := new.couvert;
  new.aberta_em := now();
  new.fechada_em := null;
  new.fechada_por := null;
  return new;
end;
$$;

create or replace function rest_privado.pedidos_entregador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.entregadores;
begin
  if tg_op = 'INSERT' then
    new.entregador_id := null;
    new.valor_entregador := 0;
    return new;
  end if;

  if new.entregador_id is distinct from old.entregador_id then
    if new.origem <> 'delivery' then
      raise exception 'Só pedido de delivery tem entregador.' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null and not rest_privado.tem_modulo(new.restaurante_id, array['delivery']) then
      raise exception 'Sem acesso ao delivery para escolher o entregador.' using errcode = 'P0001';
    end if;
    if old.status in ('entregue', 'cancelado') then
      raise exception 'Pedido já finalizado.' using errcode = 'P0001';
    end if;
  end if;

  if new.entregador_id is null then
    new.valor_entregador := 0;
  elsif new.entregador_id is distinct from old.entregador_id or new.taxa_entrega is distinct from old.taxa_entrega then
    select * into v_e from public.entregadores where id = new.entregador_id and restaurante_id = new.restaurante_id;
    if v_e.id is null or (new.entregador_id is distinct from old.entregador_id and not v_e.ativo) then
      raise exception 'Entregador inválido.' using errcode = 'P0001';
    end if;
    new.valor_entregador := case when v_e.recebe_taxa then new.taxa_entrega else v_e.valor_por_entrega end;
  else
    new.valor_entregador := old.valor_entregador;
  end if;
  return new;
end;
$$;

create or replace function public.imprimir_teste(p_impressora_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
begin
  select restaurante_id into v_restaurante_id from public.impressoras where id = p_impressora_id;
  if v_restaurante_id is null or not rest_privado.tem_modulo(v_restaurante_id, array['caixa']) then
    raise exception 'Impressora não encontrada.' using errcode = 'P0001';
  end if;
  insert into public.fila_impressao (restaurante_id, impressora_id, tipo)
  values (v_restaurante_id, p_impressora_id, 'teste');
end;
$$;

-- ---------------------------------------------------------------------------
-- Políticas: o mesmo, por módulo.
-- ---------------------------------------------------------------------------

drop policy "caixa e dono abrem o caixa" on public.caixa_sessoes;
create policy "caixa e dono abrem o caixa" on public.caixa_sessoes
  for insert to authenticated
  with check ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "caixa e dono fecham o caixa" on public.caixa_sessoes;
create policy "caixa e dono fecham o caixa" on public.caixa_sessoes
  for update to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])))
  with check ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "caixa e dono registram movimentos" on public.movimentos_caixa;
create policy "caixa e dono registram movimentos" on public.movimentos_caixa
  for insert to authenticated
  with check ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "caixa e dono estornam pagamentos" on public.pagamentos;
create policy "caixa e dono estornam pagamentos" on public.pagamentos
  for update to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])))
  with check ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "dono e caixa veem computadores" on public.agentes_impressao;
create policy "dono e caixa veem computadores" on public.agentes_impressao
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "dono e caixa veem impressoras" on public.impressoras;
create policy "dono e caixa veem impressoras" on public.impressoras
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "dono e caixa veem a fila" on public.fila_impressao;
create policy "dono e caixa veem a fila" on public.fila_impressao
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['caixa'])));

drop policy "cliente lê o próprio cadastro e dono/caixa leem os do restaurante" on public.clientes;
create policy "cliente lê o próprio cadastro e dono/caixa leem os do restaurante" on public.clientes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select rest_privado.tem_modulo(restaurante_id, array['delivery'])));

drop policy "cupons_dono_le" on public.cupons;
create policy "cupons_dono_le" on public.cupons
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['delivery'])));

drop policy "entregadores_ler" on public.entregadores;
create policy "entregadores_ler" on public.entregadores
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['delivery'])));

drop policy "pedidos_alteracoes_ler" on public.pedidos_alteracoes;
create policy "pedidos_alteracoes_ler" on public.pedidos_alteracoes
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['delivery'])));

drop policy "chamados_garcom_ler" on public.chamados_garcom;
create policy "chamados_garcom_ler" on public.chamados_garcom
  for select to authenticated
  using ((select rest_privado.tem_modulo(restaurante_id, array['caixa', 'delivery', 'comandas'])) or garcom_id in (select m.id from public.membros m where m.user_id = (select auth.uid()) and m.ativo));

drop policy "chamados_garcom_criar" on public.chamados_garcom;
create policy "chamados_garcom_criar" on public.chamados_garcom
  for insert to authenticated
  with check ((select rest_privado.tem_modulo(restaurante_id, array['caixa', 'delivery', 'comandas'])));
