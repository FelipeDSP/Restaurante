-- Planos reais (documento de marketing, 29/10): todos sem limite de usuários e de pedidos.
--   delivery   (Delivery, R$ 99,90): delivery, caixa, cardápio, cozinha, impressão, relatórios, cupons, entregadores
--   presencial (Delivery + Presencial, R$ 149,90): + mesas pelo caixa (Mesas no painel e cadastro de mesas)
--   avancado   (Avançado, R$ 199,90): + app do garçom
--   completo   (Completo, R$ 249,90): + pedido na mesa pelo QR code
-- O plano tira permissões de todo mundo do restaurante, inclusive do dono (as funções continuam
-- guardadas: subindo de plano, voltam). No teste grátis tudo fica liberado.

alter table public.assinaturas drop constraint assinaturas_plano_check;
update public.assinaturas set plano = 'avancado' where plano = 'essencial';
alter table public.assinaturas
  add constraint assinaturas_plano_check check (plano in ('delivery', 'presencial', 'avancado', 'completo'));

-- Permissões que o plano do restaurante libera (sem assinatura ou em teste: todas).
create or replace function rest_privado.permissoes_do_plano(p_restaurante_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.restaurante_id is null or a.status = 'teste' then rest_privado.permissoes_validas()
    else array(
      select x from unnest(rest_privado.permissoes_validas()) as x
      where x not in ('comandas_painel', 'comandas_gerenciar', 'mesas', 'garcom_app')
         or (x in ('comandas_painel', 'comandas_gerenciar', 'mesas') and a.plano in ('presencial', 'avancado', 'completo'))
         or (x = 'garcom_app' and a.plano in ('avancado', 'completo'))
    )
  end
  from (select 1) as base
  left join public.assinaturas a on a.restaurante_id = p_restaurante_id;
$$;

-- Pedido na mesa pelo QR code: só no Completo (ou no teste).
create or replace function rest_privado.plano_tem_qr(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.status = 'teste' or a.plano = 'completo'
    from public.assinaturas a where a.restaurante_id = p_restaurante_id
  ), true);
$$;

-- Permissões da pessoa = (as dela) ∩ (as do plano). Vale para todas as políticas e funções.
create or replace function rest_privado.permissoes_membro(p_membro_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select x
    from unnest(case
      when m.papel = 'dono' then rest_privado.permissoes_validas()
      else array(
        select distinct y
        from unnest(coalesce(f.permissoes, '{}') || m.permissoes_extras) as y
        where not y = any (m.permissoes_removidas)
      )
    end) as x
    where x = any (rest_privado.permissoes_do_plano(m.restaurante_id))
    order by 1
  )
  from public.membros m
  left join public.funcoes f on f.id = m.funcao_id
  where m.id = p_membro_id and m.ativo;
$$;

-- Para o app: o plano de cada restaurante da pessoa (o que o plano libera e se tem QR).
create or replace function public.meus_planos()
returns table (restaurante_id uuid, plano text, teste boolean, permissoes text[], qr boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.restaurante_id, a.plano, coalesce(a.status = 'teste', true),
    rest_privado.permissoes_do_plano(m.restaurante_id), rest_privado.plano_tem_qr(m.restaurante_id)
  from public.membros m
  left join public.assinaturas a on a.restaurante_id = m.restaurante_id
  where m.user_id = (select auth.uid()) and m.ativo;
$$;

revoke execute on function public.meus_planos() from public, anon;
grant execute on function public.meus_planos() to authenticated;


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
    'pode_pedir', v_mesa.pedido_mesa_qr and rest_privado.plano_tem_qr(v_mesa.restaurante_id) and exists (
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
  if not v_mesa.pedido_mesa_qr or not rest_privado.plano_tem_qr(v_mesa.restaurante_id) then
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

CREATE OR REPLACE FUNCTION public.admin_definir_assinatura(p_restaurante_id uuid, p_status text, p_plano text, p_teste_termina_em timestamp with time zone, p_periodo_termina_em timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_antes jsonb;
begin
  perform rest_privado.exigir_admin();
  if p_status not in ('teste', 'ativa', 'atrasada', 'cancelada', 'cortesia') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;
  if p_plano not in ('delivery', 'presencial', 'avancado', 'completo') then
    raise exception 'Plano inválido.' using errcode = 'P0001';
  end if;
  if p_status = 'teste' and p_teste_termina_em is null then
    raise exception 'Informe até quando vai o teste.' using errcode = 'P0001';
  end if;

  select to_jsonb(a) - 'id' - 'restaurante_id' into v_antes from public.assinaturas a where a.restaurante_id = p_restaurante_id;
  if v_antes is null then
    raise exception 'Restaurante sem assinatura.' using errcode = 'P0001';
  end if;

  update public.assinaturas
  set status = p_status, plano = p_plano, teste_termina_em = p_teste_termina_em,
      periodo_termina_em = p_periodo_termina_em, atualizado_em = now()
  where restaurante_id = p_restaurante_id;

  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (p_restaurante_id, (select auth.uid()), 'assinatura', jsonb_build_object(
    'antes', jsonb_build_object('status', v_antes ->> 'status', 'plano', v_antes ->> 'plano',
      'teste_termina_em', v_antes ->> 'teste_termina_em', 'periodo_termina_em', v_antes ->> 'periodo_termina_em'),
    'depois', jsonb_build_object('status', p_status, 'plano', p_plano,
      'teste_termina_em', p_teste_termina_em, 'periodo_termina_em', p_periodo_termina_em)
  ));
end;
$$;

-- Abrir mesa exige permissão de mesas (antes bastava ser da equipe; o app conferia).
CREATE OR REPLACE FUNCTION rest_privado.comandas_antes_inserir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_membro uuid := rest_privado.membro_atual(new.restaurante_id);
  v_r record;
begin
  -- Equipe só abre mesa com permissão de mesas (o plano também precisa ter mesas). O cliente pelo
  -- QR code (sem login) passa pela RPC pedir_pela_mesa, que confere o plano.
  if (select auth.uid()) is not null
     and not rest_privado.tem_permissao(new.restaurante_id, array['comandas_painel', 'garcom_app']) then
    raise exception 'Sem permissão para abrir mesa.' using errcode = 'P0001';
  end if;

  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  if not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  -- Quem não gerencia as mesas abre em seu próprio nome; quem gerencia pode indicar o garçom.
  if (select auth.uid()) is not null and not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar']) then
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
