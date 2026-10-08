-- Painel do dono da plataforma (super admin), em /admin.
-- Quem é admin fica em rest_privado (fora da API); tudo passa por RPCs security definer que
-- conferem isso. Nada de chave secreta no app. Cada alteração fica registrada.
--
-- Para tornar alguém admin (uma vez, no SQL do Supabase):
--   insert into rest_privado.administradores (user_id)
--   select id from auth.users where email = 'voce@exemplo.com';

create table rest_privado.administradores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table rest_privado.administradores enable row level security;
revoke all on rest_privado.administradores from public, anon, authenticated;

create table rest_privado.admin_registros (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid references public.restaurantes (id),
  user_id uuid not null,
  acao text not null,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index admin_registros_restaurante_idx on rest_privado.admin_registros (restaurante_id, criado_em desc);
alter table rest_privado.admin_registros enable row level security;
revoke all on rest_privado.admin_registros from public, anon, authenticated;

create function rest_privado.eh_admin_plataforma()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from rest_privado.administradores where user_id = (select auth.uid()));
$$;
revoke all on function rest_privado.eh_admin_plataforma() from public, anon, authenticated;

create function rest_privado.exigir_admin()
returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not rest_privado.eh_admin_plataforma() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function rest_privado.exigir_admin() from public, anon, authenticated;

-- O app pergunta antes de mostrar /admin (quem não é admin vê "não encontrado").
create function public.admin_sou_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select rest_privado.eh_admin_plataforma();
$$;
revoke all on function public.admin_sou_admin() from public, anon;
grant execute on function public.admin_sou_admin() to authenticated;

-- Visão geral + lista de restaurantes com os números de uso.
create function public.admin_painel()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform rest_privado.exigir_admin();

  with
  rest as (
    select r.*,
      a.plano, a.status as assinatura_status, a.teste_termina_em, a.periodo_termina_em,
      (select m.nome from public.membros m where m.restaurante_id = r.id and m.papel = 'dono' order by m.criado_em limit 1) as dono_nome,
      (select u.email from public.membros m join auth.users u on u.id = m.user_id
        where m.restaurante_id = r.id and m.papel = 'dono' order by m.criado_em limit 1) as dono_email,
      (select max(s.aberta_em) from public.caixa_sessoes s where s.restaurante_id = r.id) as ultimo_caixa,
      (select count(*) from public.pedidos p where p.restaurante_id = r.id and p.status <> 'cancelado'
        and p.criado_em > now() - interval '30 days') as pedidos_30d,
      (select count(*) from public.pedidos p where p.restaurante_id = r.id and p.status <> 'cancelado'
        and p.origem = 'delivery' and p.criado_em > now() - interval '30 days') as delivery_30d
    from public.restaurantes r
    left join public.assinaturas a on a.restaurante_id = r.id
    where r.excluido_em is null
  )
  select jsonb_build_object(
    'totais', jsonb_build_object(
      'restaurantes', (select count(*) from rest),
      'ativos', (select count(*) from rest where ativo),
      'em_teste', (select count(*) from rest where assinatura_status = 'teste' and teste_termina_em > now()),
      'teste_vencendo', (select count(*) from rest where assinatura_status = 'teste' and teste_termina_em between now() and now() + interval '3 days'),
      'teste_vencido', (select count(*) from rest where assinatura_status = 'teste' and teste_termina_em <= now()),
      'pagantes', (select count(*) from rest where assinatura_status = 'ativa'),
      'cortesia', (select count(*) from rest where assinatura_status = 'cortesia'),
      'atrasados', (select count(*) from rest where assinatura_status in ('atrasada', 'cancelada')),
      'cadastros_30d', (select count(*) from rest where criado_em > now() - interval '30 days'),
      'usaram_7d', (select count(*) from rest where ultimo_caixa > now() - interval '7 days'),
      'pedidos_30d', coalesce((select sum(pedidos_30d) from rest), 0),
      'vendido_30d', coalesce((
        select sum(p.total) from public.pedidos p
        where p.status <> 'cancelado' and p.criado_em > now() - interval '30 days'
      ), 0)
    ),
    'restaurantes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'nome', nome, 'slug', slug, 'ativo', ativo, 'criado_em', criado_em,
        'dono_nome', dono_nome, 'dono_email', dono_email,
        'plano', plano, 'assinatura_status', assinatura_status,
        'teste_termina_em', teste_termina_em, 'periodo_termina_em', periodo_termina_em,
        'ultimo_caixa', ultimo_caixa, 'pedidos_30d', pedidos_30d, 'delivery_30d', delivery_30d
      ) order by criado_em desc)
      from rest
    ), '[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end;
$$;
revoke all on function public.admin_painel() from public, anon;
grant execute on function public.admin_painel() to authenticated;

-- Ficha de um restaurante.
create function public.admin_restaurante(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform rest_privado.exigir_admin();

  select jsonb_build_object(
    'restaurante', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'slug', r.slug, 'ativo', r.ativo, 'criado_em', r.criado_em,
      'telefone', r.telefone, 'whatsapp', r.whatsapp, 'endereco', r.endereco, 'fuso_horario', r.fuso_horario,
      'aceita_delivery', r.aceita_delivery, 'logo_url', r.logo_url, 'cor_primaria', r.cor_primaria
    ),
    'assinatura', (
      select jsonb_build_object(
        'plano', a.plano, 'status', a.status, 'teste_termina_em', a.teste_termina_em,
        'periodo_termina_em', a.periodo_termina_em, 'provedor', a.provedor, 'atualizado_em', a.atualizado_em
      )
      from public.assinaturas a where a.restaurante_id = r.id
    ),
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', m.nome, 'papel', m.papel, 'ativo', m.ativo, 'email', u.email,
        'ultimo_acesso', u.last_sign_in_at
      ) order by m.papel, m.nome)
      from public.membros m left join auth.users u on u.id = m.user_id
      where m.restaurante_id = r.id
    ), '[]'::jsonb),
    'uso', jsonb_build_object(
      'produtos', (select count(*) from public.produtos where restaurante_id = r.id),
      'mesas', (select count(*) from public.mesas where restaurante_id = r.id and ativa),
      'bairros', (select count(*) from public.bairros_entrega where restaurante_id = r.id and ativo),
      'clientes', (select count(*) from public.clientes where restaurante_id = r.id),
      'caixas_30d', (select count(*) from public.caixa_sessoes where restaurante_id = r.id and aberta_em > now() - interval '30 days'),
      'ultimo_caixa', (select max(aberta_em) from public.caixa_sessoes where restaurante_id = r.id),
      'pedidos_30d', (select count(*) from public.pedidos where restaurante_id = r.id and status <> 'cancelado' and criado_em > now() - interval '30 days'),
      'delivery_30d', (select count(*) from public.pedidos where restaurante_id = r.id and status <> 'cancelado' and origem = 'delivery' and criado_em > now() - interval '30 days'),
      'vendido_30d', coalesce((select sum(total) from public.pedidos where restaurante_id = r.id and status <> 'cancelado' and criado_em > now() - interval '30 days'), 0)
    ),
    'registros', coalesce((
      select jsonb_agg(jsonb_build_object('acao', g.acao, 'dados', g.dados, 'em', g.criado_em, 'por', u.email) order by g.criado_em desc)
      from (select * from rest_privado.admin_registros where restaurante_id = r.id order by criado_em desc limit 30) g
      left join auth.users u on u.id = g.user_id
    ), '[]'::jsonb)
  ) into v_resultado
  from public.restaurantes r
  where r.id = p_restaurante_id and r.excluido_em is null;
  return v_resultado;
end;
$$;
revoke all on function public.admin_restaurante(uuid) from public, anon;
grant execute on function public.admin_restaurante(uuid) to authenticated;

-- Muda a assinatura à mão (cortesia, estender teste, marcar como paga...). A cobrança automática
-- (webhook) continua podendo sobrescrever depois.
create function public.admin_definir_assinatura(
  p_restaurante_id uuid,
  p_status text,
  p_plano text,
  p_teste_termina_em timestamptz,
  p_periodo_termina_em timestamptz
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  perform rest_privado.exigir_admin();
  if p_status not in ('teste', 'ativa', 'atrasada', 'cancelada', 'cortesia') then
    raise exception 'Status inválido.' using errcode = 'P0001';
  end if;
  if p_plano not in ('essencial', 'completo') then
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
revoke all on function public.admin_definir_assinatura(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_definir_assinatura(uuid, text, text, timestamptz, timestamptz) to authenticated;

-- Desativar tira o site do ar (o cardápio público só mostra restaurantes ativos). Nada é apagado.
create function public.admin_definir_ativo(p_restaurante_id uuid, p_ativo boolean, p_motivo text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo.' using errcode = 'P0001';
  end if;
  update public.restaurantes set ativo = p_ativo where id = p_restaurante_id and excluido_em is null;
  if not found then
    raise exception 'Restaurante não encontrado.' using errcode = 'P0001';
  end if;
  insert into rest_privado.admin_registros (restaurante_id, user_id, acao, dados)
  values (p_restaurante_id, (select auth.uid()), case when p_ativo then 'ativado' else 'desativado' end,
          jsonb_build_object('motivo', btrim(p_motivo)));
end;
$$;
revoke all on function public.admin_definir_ativo(uuid, boolean, text) from public, anon;
grant execute on function public.admin_definir_ativo(uuid, boolean, text) to authenticated;
