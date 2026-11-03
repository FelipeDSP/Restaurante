-- Falta de pagamento suspende o restaurante (decisão do cliente em 03/11): 5 dias depois do
-- vencimento da fatura (ou do fim do teste grátis sem pagar), o painel trava numa tela de pagamento
-- e o site para de receber pedidos. Pagou (o Asaas avisa e o vencimento anda), libera na hora.
-- Cortesia e assinatura ativa nunca suspendem (a ativa vira "atrasada" pelo aviso do Asaas).

create or replace function rest_privado.restaurante_suspenso(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.status in ('teste', 'atrasada', 'cancelada')
      and coalesce(a.periodo_termina_em, a.teste_termina_em) + interval '5 days' < now()
    from public.assinaturas a
    where a.restaurante_id = p_restaurante_id
  ), false);
$$;
revoke all on function rest_privado.restaurante_suspenso(uuid) from public, anon, authenticated;

-- Suspenso: nenhum módulo e nenhuma permissão de operação (vale em todas as políticas, para o dono
-- também). O que é só do dono pelo papel (assinatura, equipe) continua.
create or replace function rest_privado.modulos_do_restaurante(p_restaurante_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select m from unnest(rest_privado.modulos_validos()) as m
    where not rest_privado.restaurante_suspenso(p_restaurante_id)
    and (
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
      where not rest_privado.restaurante_suspenso(p_restaurante_id)
      union all
      select unnest(rest_privado.permissoes_do_modulo(m)) from unnest(rest_privado.modulos_do_restaurante(p_restaurante_id)) as m
    ) t
    order by 1
  );
$$;

-- Nenhum pedido novo (delivery, mesa ou QR) enquanto estiver suspenso.
create or replace function rest_privado.pedidos_suspenso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if rest_privado.restaurante_suspenso(new.restaurante_id) then
    raise exception 'Este restaurante não está recebendo pedidos no momento.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger t00_suspenso before insert on public.pedidos
for each row execute function rest_privado.pedidos_suspenso();

-- Site: suspenso aparece como "Restaurante indisponível no momento".
create or replace function public.consultar_disponibilidade_delivery(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_restaurante public.restaurantes;
begin
  select * into v_restaurante from public.restaurantes
  where id = p_restaurante_id and ativo and excluido_em is null;

  if v_restaurante.id is null or rest_privado.restaurante_suspenso(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'restaurante_indisponivel');
  end if;
  if not v_restaurante.aceita_delivery then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_delivery');
  end if;
  if not rest_privado.esta_no_horario(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'fora_do_horario');
  end if;
  if not exists (
    select 1 from public.caixa_sessoes where restaurante_id = p_restaurante_id and fechada_em is null
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'caixa_fechado');
  end if;
  return jsonb_build_object('aberto', true, 'motivo', null);
end;
$$;

-- O app precisa saber da suspensão para mandar a pessoa para a tela de pagamento.
drop function public.meus_planos();
create function public.meus_planos()
returns table (restaurante_id uuid, plano text, teste boolean, permissoes text[], qr boolean, suspenso boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.restaurante_id, a.plano, coalesce(a.status = 'teste', true),
    rest_privado.permissoes_do_plano(m.restaurante_id), rest_privado.plano_tem_qr(m.restaurante_id),
    rest_privado.restaurante_suspenso(m.restaurante_id)
  from public.membros m
  left join public.assinaturas a on a.restaurante_id = m.restaurante_id
  where m.user_id = (select auth.uid()) and m.ativo;
$$;
revoke execute on function public.meus_planos() from public, anon;
grant execute on function public.meus_planos() to authenticated;
