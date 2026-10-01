-- Funções auxiliares (RLS) e triggers com as regras de negócio.
-- O banco nunca confia em valores do cliente para: preços, totais, sessão de caixa,
-- número do pedido e autoria (quem abriu, registrou, cancelou, estornou).

-- ---------------------------------------------------------------------------
-- Auxiliares de autorização
-- ---------------------------------------------------------------------------

create function rest_privado.eh_membro(p_restaurante_id uuid)
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
      and r.excluido_em is null
  );
$$;

create function rest_privado.tem_papel(p_restaurante_id uuid, p_papeis text[])
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
      and m.papel = any (p_papeis)
      and r.excluido_em is null
  );
$$;

-- membros.id do usuário logado no restaurante (null para anônimo ou não membro).
create function rest_privado.membro_atual(p_restaurante_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id
  from public.membros m
  where m.restaurante_id = p_restaurante_id
    and m.user_id = (select auth.uid())
    and m.ativo;
$$;

create function rest_privado.papel_atual(p_restaurante_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select m.papel
  from public.membros m
  where m.restaurante_id = p_restaurante_id
    and m.user_id = (select auth.uid())
    and m.ativo;
$$;

-- Restaurante visível ao público (site de delivery).
create function rest_privado.restaurante_publico(p_restaurante_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.restaurantes r
    where r.id = p_restaurante_id and r.ativo and r.excluido_em is null
  );
$$;

-- Converte texto em uuid sem erro (usado nas policies de storage).
create function rest_privado.texto_para_uuid(p_texto text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p_texto::uuid;
exception when others then
  return null;
end;
$$;

-- Sessão de caixa aberta do restaurante; erro se não houver.
create function rest_privado.caixa_aberto(p_restaurante_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.caixa_sessoes
  where restaurante_id = p_restaurante_id and fechada_em is null;

  if v_id is null then
    raise exception 'Caixa fechado: abra o caixa antes de continuar.' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- Restaurante dentro do horário de funcionamento (no fuso do restaurante).
create function rest_privado.esta_no_horario(p_restaurante_id uuid, p_momento timestamptz default now())
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_dias constant text[] := array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  v_fuso text;
  v_horarios jsonb;
  v_local timestamp;
  v_dia integer;
  v_hora time;
  v_intervalo jsonb;
  v_abre time;
  v_fecha time;
begin
  select fuso_horario, horarios into v_fuso, v_horarios
  from public.restaurantes where id = p_restaurante_id;

  if v_fuso is null then
    return false;
  end if;

  v_local := p_momento at time zone v_fuso;
  v_dia := extract(dow from v_local)::integer;
  v_hora := v_local::time;

  -- Intervalos de hoje.
  for v_intervalo in select * from jsonb_array_elements(coalesce(v_horarios -> v_dias[v_dia + 1], '[]'::jsonb)) loop
    v_abre := (v_intervalo ->> 'abre')::time;
    v_fecha := (v_intervalo ->> 'fecha')::time;
    if v_fecha > v_abre then
      if v_hora >= v_abre and v_hora < v_fecha then return true; end if;
    elsif v_hora >= v_abre then
      return true;
    end if;
  end loop;

  -- Intervalos de ontem que cruzam a meia-noite.
  for v_intervalo in select * from jsonb_array_elements(coalesce(v_horarios -> v_dias[((v_dia + 6) % 7) + 1], '[]'::jsonb)) loop
    v_abre := (v_intervalo ->> 'abre')::time;
    v_fecha := (v_intervalo ->> 'fecha')::time;
    if v_fecha <= v_abre and v_hora < v_fecha then return true; end if;
  end loop;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers genéricos
-- ---------------------------------------------------------------------------

create function rest_privado.restaurante_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.restaurante_id is distinct from old.restaurante_id then
    raise exception 'Não é permitido mudar o restaurante de um registro.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['membros', 'categorias', 'produtos', 'mesas', 'bairros_entrega',
                           'caixa_sessoes', 'comandas', 'pedidos', 'itens_pedido', 'pagamentos'] loop
    execute format(
      'create trigger t00_restaurante_fixo before update on public.%I for each row execute function rest_privado.restaurante_fixo()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- restaurantes
-- ---------------------------------------------------------------------------

create function rest_privado.restaurantes_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Falha se o fuso não existir.
  perform now() at time zone new.fuso_horario;
  if jsonb_typeof(new.horarios) <> 'object' then
    raise exception 'Horários inválidos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger t10_validar before insert or update on public.restaurantes
  for each row execute function rest_privado.restaurantes_validar();

-- ---------------------------------------------------------------------------
-- caixa_sessoes
-- ---------------------------------------------------------------------------

create function rest_privado.caixa_sessoes_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.aberta_por := rest_privado.membro_atual(new.restaurante_id);
  if new.aberta_por is null then
    raise exception 'Usuário não é membro do restaurante.' using errcode = 'P0001';
  end if;
  new.aberta_em := now();
  new.fechada_em := null;
  new.fechada_por := null;
  new.valor_contado := null;
  new.ultimo_numero_pedido := 0;
  return new;
end;
$$;

create function rest_privado.caixa_sessoes_antes_atualizar()
returns trigger
language plpgsql security definer
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

create trigger t10_antes_inserir before insert on public.caixa_sessoes
  for each row execute function rest_privado.caixa_sessoes_antes_inserir();
create trigger t10_antes_atualizar before update on public.caixa_sessoes
  for each row execute function rest_privado.caixa_sessoes_antes_atualizar();

-- ---------------------------------------------------------------------------
-- comandas
-- ---------------------------------------------------------------------------

create function rest_privado.comandas_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_membro uuid := rest_privado.membro_atual(new.restaurante_id);
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  if not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  -- Garçom sempre abre em seu próprio nome; dono/caixa podem indicar o garçom.
  if rest_privado.papel_atual(new.restaurante_id) = 'garcom' then
    new.garcom_id := v_membro;
  else
    new.garcom_id := coalesce(new.garcom_id, v_membro);
  end if;

  new.status := 'aberta';
  new.total := 0;
  new.aberta_em := now();
  new.fechada_em := null;
  new.fechada_por := null;
  return new;
end;
$$;

create function rest_privado.comandas_antes_atualizar()
returns trigger
language plpgsql security definer
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
    return new;
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

create trigger t10_antes_inserir before insert on public.comandas
  for each row execute function rest_privado.comandas_antes_inserir();
create trigger t10_antes_atualizar before update on public.comandas
  for each row execute function rest_privado.comandas_antes_atualizar();

-- ---------------------------------------------------------------------------
-- pedidos
-- ---------------------------------------------------------------------------

create function rest_privado.pedidos_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_numero integer;
  v_status_comanda text;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  update public.caixa_sessoes
  set ultimo_numero_pedido = ultimo_numero_pedido + 1
  where id = new.caixa_sessao_id
  returning ultimo_numero_pedido into v_numero;
  new.numero := v_numero;

  if new.origem = 'mesa' then
    select status into v_status_comanda
    from public.comandas
    where id = new.comanda_id and restaurante_id = new.restaurante_id
    for update;

    if v_status_comanda is null or v_status_comanda not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
    -- Novo lançamento depois de pedir a conta reabre a comanda.
    if v_status_comanda = 'conta_pedida' then
      update public.comandas set status = 'aberta' where id = new.comanda_id;
    end if;
  end if;

  if new.origem <> 'delivery' then
    new.taxa_entrega := 0;
  end if;

  new.status := 'recebido';
  new.subtotal := 0;
  new.total := new.taxa_entrega;
  new.criado_por := rest_privado.membro_atual(new.restaurante_id);
  new.criado_em := now();
  new.cancelado_em := null;
  new.cancelado_por := null;
  new.motivo_cancelamento := null;
  return new;
end;
$$;

create function rest_privado.pedidos_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_subtotal integer;
begin
  new.numero := old.numero;
  new.origem := old.origem;
  new.comanda_id := old.comanda_id;
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;

  if old.status = 'cancelado' then
    if new.status <> 'cancelado' then
      raise exception 'Pedido cancelado não pode ser reaberto.' using errcode = 'P0001';
    end if;
    new.cancelado_em := old.cancelado_em;
    new.cancelado_por := old.cancelado_por;
    new.motivo_cancelamento := old.motivo_cancelamento;
  elsif new.status = 'cancelado' then
    if coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_em := now();
    new.cancelado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.cancelado_em := null;
    new.cancelado_por := null;
    new.motivo_cancelamento := null;
  end if;

  if new.origem <> 'delivery' then
    new.taxa_entrega := 0;
  end if;

  select coalesce(sum(total), 0) into v_subtotal
  from public.itens_pedido
  where pedido_id = new.id and cancelado_em is null;

  new.subtotal := v_subtotal;
  new.total := v_subtotal + new.taxa_entrega;
  return new;
end;
$$;

-- Propaga o total para a comanda.
create function rest_privado.pedidos_depois_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.comanda_id is not null
     and (new.total is distinct from old.total or new.status is distinct from old.status) then
    update public.comandas set total = total where id = new.comanda_id;
  end if;
  return null;
end;
$$;

create trigger t10_antes_inserir before insert on public.pedidos
  for each row execute function rest_privado.pedidos_antes_inserir();
create trigger t10_antes_atualizar before update on public.pedidos
  for each row execute function rest_privado.pedidos_antes_atualizar();
create trigger t20_depois_atualizar after update on public.pedidos
  for each row execute function rest_privado.pedidos_depois_atualizar();

-- ---------------------------------------------------------------------------
-- itens_pedido
-- ---------------------------------------------------------------------------

create function rest_privado.itens_pedido_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_preco integer;
  v_disponivel boolean;
  v_status_pedido text;
  v_comanda_id uuid;
  v_status_comanda text;
begin
  select nome, preco, disponivel into v_nome, v_preco, v_disponivel
  from public.produtos
  where id = new.produto_id and restaurante_id = new.restaurante_id;

  if v_nome is null then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;
  if not v_disponivel then
    raise exception 'Produto indisponível: %.', v_nome using errcode = 'P0001';
  end if;

  select status, comanda_id into v_status_pedido, v_comanda_id
  from public.pedidos
  where id = new.pedido_id and restaurante_id = new.restaurante_id;

  if v_status_pedido is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_status_pedido = 'cancelado' then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;
  if v_comanda_id is not null then
    select status into v_status_comanda from public.comandas where id = v_comanda_id;
    if v_status_comanda not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
  end if;

  -- Preço congelado: sempre do cadastro, nunca do cliente.
  new.nome_produto := v_nome;
  new.preco_unitario := v_preco;
  new.total := v_preco * new.quantidade;
  new.criado_em := now();
  new.cancelado_em := null;
  new.cancelado_por := null;
  new.motivo_cancelamento := null;
  return new;
end;
$$;

create function rest_privado.itens_pedido_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is not null then
    raise exception 'Item já cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and status = 'cancelado') then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;

  new.pedido_id := old.pedido_id;
  new.produto_id := old.produto_id;
  new.nome_produto := old.nome_produto;
  new.preco_unitario := old.preco_unitario;
  new.criado_em := old.criado_em;

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

  new.total := new.preco_unitario * new.quantidade;
  return new;
end;
$$;

-- Recalcula o pedido (que por sua vez recalcula a comanda).
create function rest_privado.itens_pedido_depois_alterar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.pedidos set subtotal = subtotal where id = new.pedido_id;
  return null;
end;
$$;

create trigger t10_antes_inserir before insert on public.itens_pedido
  for each row execute function rest_privado.itens_pedido_antes_inserir();
create trigger t10_antes_atualizar before update on public.itens_pedido
  for each row execute function rest_privado.itens_pedido_antes_atualizar();
create trigger t20_depois_alterar after insert or update on public.itens_pedido
  for each row execute function rest_privado.itens_pedido_depois_alterar();

-- ---------------------------------------------------------------------------
-- pagamentos
-- ---------------------------------------------------------------------------

create function rest_privado.pagamentos_antes_inserir()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status text;
  v_origem text;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);
  new.registrado_por := rest_privado.membro_atual(new.restaurante_id);
  if new.registrado_por is null then
    raise exception 'Usuário não é membro do restaurante.' using errcode = 'P0001';
  end if;

  if new.comanda_id is not null then
    select status into v_status
    from public.comandas
    where id = new.comanda_id and restaurante_id = new.restaurante_id;
    if v_status is null or v_status not in ('aberta', 'conta_pedida') then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
  else
    select status, origem into v_status, v_origem
    from public.pedidos
    where id = new.pedido_id and restaurante_id = new.restaurante_id;
    if v_status is null or v_status = 'cancelado' then
      raise exception 'Pedido inválido ou cancelado.' using errcode = 'P0001';
    end if;
    if v_origem = 'mesa' then
      raise exception 'Pagamento de mesa deve ser registrado na comanda.' using errcode = 'P0001';
    end if;
  end if;

  new.criado_em := now();
  new.estornado_em := null;
  new.estornado_por := null;
  return new;
end;
$$;

-- Pagamento só pode ser estornado; nenhum outro campo muda.
create function rest_privado.pagamentos_antes_atualizar()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.estornado_em is not null then
    raise exception 'Pagamento já estornado.' using errcode = 'P0001';
  end if;

  new.comanda_id := old.comanda_id;
  new.pedido_id := old.pedido_id;
  new.caixa_sessao_id := old.caixa_sessao_id;
  new.valor := old.valor;
  new.forma := old.forma;
  new.registrado_por := old.registrado_por;
  new.criado_em := old.criado_em;

  if new.estornado_em is not null then
    if old.comanda_id is not null and exists (
      select 1 from public.comandas where id = old.comanda_id and status = 'fechada'
    ) then
      raise exception 'Comanda fechada: não é possível estornar.' using errcode = 'P0001';
    end if;
    new.estornado_em := now();
    new.estornado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.estornado_por := null;
  end if;
  return new;
end;
$$;

create trigger t10_antes_inserir before insert on public.pagamentos
  for each row execute function rest_privado.pagamentos_antes_inserir();
create trigger t10_antes_atualizar before update on public.pagamentos
  for each row execute function rest_privado.pagamentos_antes_atualizar();

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------

revoke all on all functions in schema rest_privado from public, anon, authenticated;

-- Usadas dentro de policies: precisam ser executáveis por quem consulta.
grant execute on function
  rest_privado.eh_membro(uuid),
  rest_privado.tem_papel(uuid, text[]),
  rest_privado.restaurante_publico(uuid),
  rest_privado.texto_para_uuid(text)
to anon, authenticated;
