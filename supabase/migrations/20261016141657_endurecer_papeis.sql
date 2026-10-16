-- Verificação de segurança (16/10): o que cada papel pode fazer dentro do próprio restaurante.
-- Nada aqui muda dados existentes; só regras de escrita.

-- 1) Pedido: os dados do cliente, da entrega e do dinheiro não mudam depois de criado.
--    Antes, qualquer membro (até a cozinha) podia zerar a taxa de entrega ou trocar o telefone
--    direto pela API. Status do delivery (aceitar, saiu, entregue, cancelar) é só do dono e do caixa;
--    a cozinha só leva de "em preparo" para "pronto" (é o que acontece quando a última praça termina).
--    Pedido com pagamento ativo não é cancelado: estorne antes, como já acontece na comanda.
create or replace function rest_privado.pedidos_campos_fixos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.taxa_entrega is distinct from old.taxa_entrega
     or new.bairro_id is distinct from old.bairro_id
     or new.endereco is distinct from old.endereco
     or new.cliente_nome is distinct from old.cliente_nome
     or new.cliente_telefone is distinct from old.cliente_telefone
     or new.forma_pagamento_prevista is distinct from old.forma_pagamento_prevista
     or new.troco_para is distinct from old.troco_para
     or new.chave_idempotencia is distinct from old.chave_idempotencia
     or new.observacao is distinct from old.observacao
     -- cliente_id só pode sumir (conta do cliente excluída: a FK faz "set null").
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

create trigger t03_campos_fixos
before update on public.pedidos
for each row execute function rest_privado.pedidos_campos_fixos();

-- 2) Delivery: limite no próprio banco (a função é pública e pode ser chamada sem passar pelo site).
--    Mesmo telefone: até 5 pedidos em 10 minutos. Restaurante: até 40 pedidos esperando aceite.
create or replace function rest_privado.pedidos_limite_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.origem <> 'delivery' then
    return new;
  end if;
  if (
    select count(*) from public.pedidos
    where restaurante_id = new.restaurante_id
      and origem = 'delivery'
      and cliente_telefone = new.cliente_telefone
      and criado_em > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'Muitos pedidos seguidos com este telefone. Aguarde alguns minutos.' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.pedidos
    where restaurante_id = new.restaurante_id
      and origem = 'delivery'
      and status = 'recebido'
  ) >= 40 then
    raise exception 'O restaurante está com muitos pedidos agora. Tente de novo em alguns minutos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger t09_limite_delivery
before insert on public.pedidos
for each row execute function rest_privado.pedidos_limite_delivery();

-- 3) Caixa: só fechar (hora, valor contado e observação) é escrito pela equipe. Antes dava para
--    mexer no contador de número de pedido e travar todos os pedidos da noite.
revoke update on public.caixa_sessoes from authenticated;
grant update (fechada_em, valor_contado, observacao) on public.caixa_sessoes to authenticated;

create or replace function rest_privado.caixa_sessoes_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.aberta_por := old.aberta_por;
  new.aberta_em := old.aberta_em;
  new.valor_inicial := old.valor_inicial;

  if old.fechada_em is not null then
    if new.fechada_em is distinct from old.fechada_em
       or new.valor_contado is distinct from old.valor_contado then
      raise exception 'Caixa já fechado.' using errcode = 'P0001';
    end if;
    new.fechada_por := old.fechada_por;
    -- Caixa fechado não muda mais (nem a observação).
    new.observacao := old.observacao;
    return new;
  end if;

  if new.fechada_em is not null then
    if new.valor_contado is null then
      raise exception 'Informe o valor contado para fechar o caixa.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.comandas
      where restaurante_id = new.restaurante_id and status in ('aberta', 'conta_pedida')
    ) then
      raise exception 'Existem comandas abertas: feche-as antes de fechar o caixa.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.pedidos
      where restaurante_id = new.restaurante_id
        and caixa_sessao_id = new.id
        and origem = 'delivery'
        and status not in ('entregue', 'cancelado')
    ) then
      raise exception 'Existem pedidos de delivery em andamento.' using errcode = 'P0001';
    end if;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
    if new.fechada_por is null then
      raise exception 'Usuário não é membro do restaurante.' using errcode = 'P0001';
    end if;
  else
    new.fechada_por := null;
    new.valor_contado := null;
  end if;
  return new;
end;
$$;

-- 4) Comanda: o garçom responsável só muda pelo dono ou caixa; comanda encerrada não muda
--    (antes um garçom podia "assumir" as mesas fechadas de outro e mudar o relatório).
create or replace function rest_privado.comandas_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_pago integer;
begin
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.aberta_em := old.aberta_em;

  select coalesce(sum(total), 0) into v_total
  from public.pedidos
  where comanda_id = new.id and status <> 'cancelado';

  if old.status in ('fechada', 'cancelada') then
    if new.status <> old.status or v_total <> old.total or new.mesa_id <> old.mesa_id then
      raise exception 'Comanda já encerrada.' using errcode = 'P0001';
    end if;
    new.fechada_em := old.fechada_em;
    new.fechada_por := old.fechada_por;
    new.garcom_id := old.garcom_id;
    new.pessoas := old.pessoas;
    return new;
  end if;

  if new.garcom_id is distinct from old.garcom_id
     and (select auth.uid()) is not null
     and not rest_privado.tem_papel(new.restaurante_id, array['dono', 'caixa']) then
    raise exception 'Apenas dono ou caixa trocam o garçom da mesa.' using errcode = 'P0001';
  end if;

  new.total := v_total;

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

    if v_pago < v_total then
      raise exception 'Comanda não quitada: faltam % centavos.', v_total - v_pago using errcode = 'P0001';
    end if;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
  elsif new.status = 'cancelada' then
    if coalesce(rest_privado.papel_atual(new.restaurante_id), '') not in ('dono', 'caixa') then
      raise exception 'Apenas dono ou caixa podem cancelar uma comanda.' using errcode = 'P0001';
    end if;
    if v_total <> 0 then
      raise exception 'Cancele os itens antes de cancelar a comanda.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pagamentos where comanda_id = new.id and estornado_em is null) then
      raise exception 'Estorne os pagamentos antes de cancelar a comanda.' using errcode = 'P0001';
    end if;
    new.fechada_em := now();
    new.fechada_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.fechada_em := null;
    new.fechada_por := null;
  end if;
  return new;
end;
$$;

-- 5) Equipe: ninguém vira membro de um restaurante direto pela API (antes um dono podia
--    colocar qualquer conta, até a de um cliente, na equipe dele). O painel grava pelo servidor,
--    depois de conferir que quem pede é dono.
revoke insert on public.membros from authenticated;

-- 6) Código de pareamento do app de impressão: só o servidor grava, por esta função, com validade
--    curta e sem repetir entre restaurantes. Antes um dono podia gravar milhares de códigos com
--    validade longa e travar o pareamento dos outros restaurantes.
revoke insert (codigo_hash, codigo_expira_em) on public.agentes_impressao from authenticated;
revoke update (codigo_hash, codigo_expira_em) on public.agentes_impressao from authenticated;

create unique index if not exists agentes_impressao_codigo_unico
  on public.agentes_impressao (codigo_hash)
  where codigo_hash is not null;

create or replace function public.definir_codigo_pareamento(p_agente_id uuid, p_codigo_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante uuid;
  v_expira timestamptz := case when p_codigo_hash is null then null else now() + interval '10 minutes' end;
begin
  select restaurante_id into v_restaurante from public.agentes_impressao where id = p_agente_id;
  if v_restaurante is null or not rest_privado.tem_papel(v_restaurante, array['dono']) then
    raise exception 'Computador não encontrado.' using errcode = 'P0001';
  end if;
  if p_codigo_hash is not null and p_codigo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Código inválido.' using errcode = 'P0001';
  end if;

  update public.agentes_impressao
  set codigo_hash = p_codigo_hash,
      codigo_expira_em = v_expira,
      ativo = case when p_codigo_hash is null then ativo else true end
  where id = p_agente_id;
  return v_expira;
end;
$$;

revoke execute on function public.definir_codigo_pareamento(uuid, text) from public, anon;
grant execute on function public.definir_codigo_pareamento(uuid, text) to authenticated;

-- Até 10 computadores por restaurante.
create or replace function rest_privado.agentes_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.agentes_impressao where restaurante_id = new.restaurante_id) >= 10 then
    raise exception 'Limite de 10 computadores. Exclua um que não usa mais.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger t05_limite
before insert on public.agentes_impressao
for each row execute function rest_privado.agentes_limite();

-- 7) Cadastro de restaurante: e-mail confirmado e o limite de 3 por conta sem corrida
--    (dois envios ao mesmo tempo passavam do limite).
create or replace function public.criar_meu_restaurante(
  p_nome text,
  p_slug text,
  p_nome_dono text,
  p_fuso text,
  p_whatsapp text default null,
  p_cor_primaria text default '#111827',
  p_cor_secundaria text default '#f59e0b'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'Entre com a sua conta para cadastrar o restaurante.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and coalesce(u.email, '') <> '') then
    raise exception 'Crie a conta do restaurante com um e-mail.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'Confirme o seu e-mail antes de cadastrar o restaurante.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('criar_meu_restaurante:' || v_uid::text));

  -- Limite simples contra abuso do teste grátis.
  if (select count(*) from public.membros where user_id = v_uid and papel = 'dono') >= 3 then
    raise exception 'Limite de restaurantes por conta atingido. Fale com o suporte.' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_nome_dono, ''))) not between 1 and 80 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;

  if rest_privado.slug_reservado(p_slug) then
    raise exception 'Esse endereço é reservado. Escolha outro.' using errcode = 'P0001';
  end if;

  begin
    insert into public.restaurantes (slug, nome, fuso_horario, whatsapp, cor_primaria, cor_secundaria, aceita_delivery)
    values (p_slug, btrim(p_nome), p_fuso, nullif(btrim(p_whatsapp), ''), p_cor_primaria, p_cor_secundaria, false)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esse endereço já está em uso. Escolha outro.' using errcode = 'P0001';
  end;

  insert into public.membros (restaurante_id, user_id, nome, papel)
  values (v_id, v_uid, btrim(p_nome_dono), 'dono');

  return v_id;
end;
$$;
