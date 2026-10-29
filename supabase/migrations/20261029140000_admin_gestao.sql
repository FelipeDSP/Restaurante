-- Super admin gerenciando qualquer restaurante (pedido do cliente em 29/10, "como o super admin do
-- Chatwoot"): módulos ligados/desligados por restaurante, equipe (criar, editar, desativar, trocar
-- senha), criar restaurante já com o dono e "entrar como" o dono para dar suporte (registrado).
-- Contas de login (auth) são criadas/alteradas pelo servidor com a chave secreta, depois de conferir
-- que é admin; o resto passa por estas RPCs, que exigem admin e registram cada mudança.

-- ---------------------------------------------------------------------------
-- Módulos: o plano define o padrão; o admin pode liberar ou bloquear um módulo só para um restaurante.
-- ---------------------------------------------------------------------------
create or replace function rest_privado.modulos_validos()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['mesas', 'garcom', 'qr', 'cozinha', 'relatorios', 'cupons', 'entregadores'];
$$;

alter table public.assinaturas
  add column modulos_liberados text[] not null default '{}',
  add column modulos_bloqueados text[] not null default '{}',
  add constraint assinaturas_modulos_validos check (
    modulos_liberados <@ rest_privado.modulos_validos() and modulos_bloqueados <@ rest_privado.modulos_validos()
    and not (modulos_liberados && modulos_bloqueados)
  );

-- Permissões que cada módulo libera (o resto: caixa, cardápio, dados do restaurante e delivery, sempre).
create or replace function rest_privado.permissoes_do_modulo(p_modulo text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_modulo
    when 'mesas' then array['comandas_painel', 'comandas_gerenciar', 'mesas']
    when 'garcom' then array['garcom_app']
    when 'cozinha' then array['cozinha_tela', 'impressao']
    when 'relatorios' then array['relatorios']
    when 'cupons' then array['cupons']
    when 'entregadores' then array['entregadores']
    else '{}'::text[]
  end;
$$;

-- Módulos que valem para o restaurante: os do plano (no teste ou sem assinatura, todos), mais os
-- liberados, menos os bloqueados.
create or replace function rest_privado.modulos_do_restaurante(p_restaurante_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select m from unnest(rest_privado.modulos_validos()) as m
    where (
      a.restaurante_id is null or a.status = 'teste'
      or m = any (a.modulos_liberados)
      or m in ('cozinha', 'relatorios', 'cupons', 'entregadores')
      or (m = 'mesas' and a.plano in ('presencial', 'avancado', 'completo'))
      or (m = 'garcom' and a.plano in ('avancado', 'completo'))
      or (m = 'qr' and a.plano = 'completo')
    )
    and not m = any (coalesce(a.modulos_bloqueados, '{}'))
  )
  from (select 1) as base
  left join public.assinaturas a on a.restaurante_id = p_restaurante_id;
$$;

create or replace function rest_privado.permissoes_do_plano(p_restaurante_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select distinct x from (
      select unnest(array['caixa_operar', 'caixa_estornar', 'cardapio', 'restaurante', 'delivery']) as x
      union all
      select unnest(rest_privado.permissoes_do_modulo(m)) from unnest(rest_privado.modulos_do_restaurante(p_restaurante_id)) as m
    ) t
    order by 1
  );
$$;

create or replace function rest_privado.plano_tem_qr(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select 'qr' = any (rest_privado.modulos_do_restaurante(p_restaurante_id));
$$;

create or replace function public.admin_definir_modulos(p_restaurante_id uuid, p_liberados text[], p_bloqueados text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform rest_privado.exigir_admin();
  select jsonb_build_object('liberados', modulos_liberados, 'bloqueados', modulos_bloqueados) into v_antes
  from public.assinaturas where restaurante_id = p_restaurante_id;
  if v_antes is null then
    raise exception 'Restaurante sem assinatura.' using errcode = 'P0001';
  end if;
  update public.assinaturas
  set modulos_liberados = coalesce(p_liberados, '{}'), modulos_bloqueados = coalesce(p_bloqueados, '{}'), atualizado_em = now()
  where restaurante_id = p_restaurante_id;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (p_restaurante_id, (select auth.uid()), 'modulos', jsonb_build_object(
    'antes', v_antes, 'depois', jsonb_build_object('liberados', p_liberados, 'bloqueados', p_bloqueados)));
end;
$$;
revoke all on function public.admin_definir_modulos(uuid, text[], text[]) from public, anon;
grant execute on function public.admin_definir_modulos(uuid, text[], text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipe de qualquer restaurante
-- ---------------------------------------------------------------------------
create or replace function public.admin_equipe(p_restaurante_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  return jsonb_build_object(
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'user_id', m.user_id, 'nome', m.nome, 'papel', m.papel, 'funcao_id', m.funcao_id,
        'funcao', f.nome, 'ativo', m.ativo, 'email', u.email, 'ultimo_acesso', u.last_sign_in_at
      ) order by m.papel = 'dono' desc, m.ativo desc, m.nome)
      from public.membros m
      left join public.funcoes f on f.id = m.funcao_id
      left join auth.users u on u.id = m.user_id
      where m.restaurante_id = p_restaurante_id
    ), '[]'::jsonb),
    'funcoes', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome) order by f.nome)
      from public.funcoes f where f.restaurante_id = p_restaurante_id
    ), '[]'::jsonb),
    'modulos', (
      select jsonb_build_object(
        'plano', a.plano, 'status', a.status,
        'liberados', a.modulos_liberados, 'bloqueados', a.modulos_bloqueados,
        'efetivos', rest_privado.modulos_do_restaurante(p_restaurante_id)
      )
      from public.assinaturas a where a.restaurante_id = p_restaurante_id
    )
  );
end;
$$;
revoke all on function public.admin_equipe(uuid) from public, anon;
grant execute on function public.admin_equipe(uuid) to authenticated;

-- Põe uma conta (já criada pelo servidor) na equipe. p_funcao: 'dono' ou o id de uma função do restaurante.
create or replace function public.admin_adicionar_membro(p_restaurante_id uuid, p_user_id uuid, p_nome text, p_funcao text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform rest_privado.exigir_admin();
  begin
    insert into public.membros (restaurante_id, user_id, nome, papel, funcao_id)
    values (p_restaurante_id, p_user_id, btrim(p_nome),
      case when p_funcao = 'dono' then 'dono' else 'equipe' end,
      case when p_funcao = 'dono' then null else p_funcao::uuid end)
    returning id into v_id;
  exception
    when unique_violation then raise exception 'Essa pessoa já faz parte da equipe (pode estar desativada).' using errcode = 'P0001';
    when foreign_key_violation or invalid_text_representation then raise exception 'Escolha a função de novo.' using errcode = 'P0001';
  end;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (p_restaurante_id, (select auth.uid()), 'membro_adicionado', jsonb_build_object('nome', btrim(p_nome), 'funcao', p_funcao));
  return v_id;
end;
$$;
revoke all on function public.admin_adicionar_membro(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_adicionar_membro(uuid, uuid, text, text) to authenticated;

-- Nome, função e ativo de alguém da equipe (o banco mantém pelo menos um dono ativo).
create or replace function public.admin_salvar_membro(p_membro_id uuid, p_nome text, p_funcao text, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
begin
  perform rest_privado.exigir_admin();
  select restaurante_id, nome, papel, funcao_id, ativo into v_antes from public.membros where id = p_membro_id;
  if v_antes.restaurante_id is null then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0001';
  end if;
  begin
    update public.membros
    set nome = btrim(p_nome),
        papel = case when p_funcao = 'dono' then 'dono' else 'equipe' end,
        funcao_id = case when p_funcao = 'dono' then null else p_funcao::uuid end,
        ativo = p_ativo
    where id = p_membro_id;
  exception
    when foreign_key_violation or invalid_text_representation then raise exception 'Escolha a função de novo.' using errcode = 'P0001';
  end;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (v_antes.restaurante_id, (select auth.uid()), 'membro_alterado', jsonb_build_object(
    'antes', jsonb_build_object('nome', v_antes.nome, 'papel', v_antes.papel, 'funcao_id', v_antes.funcao_id, 'ativo', v_antes.ativo),
    'depois', jsonb_build_object('nome', btrim(p_nome), 'funcao', p_funcao, 'ativo', p_ativo)));
end;
$$;
revoke all on function public.admin_salvar_membro(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_salvar_membro(uuid, text, text, boolean) to authenticated;

-- Registro do que o servidor faz com a chave secreta (trocar senha, entrar como), com o admin logado.
create or replace function public.admin_registrar(p_restaurante_id uuid, p_acao text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  if p_acao not in ('senha_trocada', 'entrou_como', 'conta_criada') then
    raise exception 'Ação inválida.' using errcode = 'P0001';
  end if;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (p_restaurante_id, (select auth.uid()), p_acao, coalesce(p_dados, '{}'));
end;
$$;
revoke all on function public.admin_registrar(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_registrar(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Restaurante novo já com o dono (conta criada antes pelo servidor). Mesmas regras do cadastro.
-- ---------------------------------------------------------------------------
create or replace function public.admin_criar_restaurante(
  p_dono_user_id uuid, p_nome text, p_slug text, p_nome_dono text, p_fuso text, p_whatsapp text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform rest_privado.exigir_admin();
  if length(btrim(coalesce(p_nome, ''))) not between 2 and 80 then
    raise exception 'Informe o nome do restaurante.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_nome_dono, ''))) not between 1 and 80 then
    raise exception 'Informe o nome do dono.' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 40 then
    raise exception 'Endereço inválido: use letras minúsculas, números e hífen.' using errcode = 'P0001';
  end if;
  if rest_privado.slug_reservado(p_slug) then
    raise exception 'Esse endereço é reservado. Escolha outro.' using errcode = 'P0001';
  end if;
  begin
    insert into public.restaurantes (slug, nome, fuso_horario, whatsapp, aceita_delivery)
    values (p_slug, btrim(p_nome), coalesce(nullif(p_fuso, ''), 'America/Sao_Paulo'), nullif(btrim(p_whatsapp), ''), false)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esse endereço já está em uso. Escolha outro.' using errcode = 'P0001';
  end;
  insert into public.membros (restaurante_id, user_id, nome, papel)
  values (v_id, p_dono_user_id, btrim(p_nome_dono), 'dono');
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (v_id, (select auth.uid()), 'restaurante_criado', jsonb_build_object('nome', btrim(p_nome), 'slug', p_slug));
  return v_id;
end;
$$;
revoke all on function public.admin_criar_restaurante(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.admin_criar_restaurante(uuid, text, text, text, text, text) to authenticated;
