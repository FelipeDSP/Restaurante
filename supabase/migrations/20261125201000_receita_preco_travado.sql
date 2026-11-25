-- Receita do painel da plataforma com o preço que cada um paga de verdade.
--
-- `admin_financeiro` devolvia só a contagem por plano e situação, e a tela multiplicava pelo
-- preço de tabela. Com a promoção, dois restaurantes no mesmo plano pagam valores diferentes,
-- então a conta passaria a mentir. Agora vem também a soma do que está gravado em
-- `assinaturas.preco_centavos` e quantas assinaturas têm esse valor: a tela soma o que está
-- gravado e usa o preço de tabela só para as antigas, que ainda não têm preço próprio.
--
-- `admin_restaurante_detalhes` passa a dizer quanto aquele restaurante paga e até quando o
-- valor está garantido — é a primeira pergunta do suporte quando alguém liga perguntando o
-- porquê da diferença.

create or replace function public.admin_financeiro()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform rest_privado.exigir_admin();
  return jsonb_build_object(
    'por_plano', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plano', plano, 'status', status, 'quantidade', n,
        'com_preco', com_preco, 'soma_preco', soma_preco
      ))
      from (
        select plano, status, count(*) as n,
               count(preco_centavos) as com_preco,
               coalesce(sum(preco_centavos), 0) as soma_preco
        from public.assinaturas group by plano, status
      ) x
    ), '[]'::jsonb),
    'inadimplentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'nome', r.nome, 'plano', a.plano, 'status', a.status,
        'periodo_termina_em', a.periodo_termina_em, 'fatura_url', a.fatura_url
      ) order by a.periodo_termina_em nulls first)
      from public.assinaturas a join public.restaurantes r on r.id = a.restaurante_id
      where a.status in ('atrasada', 'cancelada')
    ), '[]'::jsonb),
    -- Pagamentos: cada cobrança uma vez (cartão manda "confirmado" e depois "recebido").
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurante_id', r.id, 'nome', r.nome, 'valor', p.valor, 'em', p.em
      ) order by p.em desc)
      from (
        select distinct on (e.dados -> 'payment' ->> 'id')
          e.dados -> 'payment' ->> 'subscription' as assinatura,
          round(((e.dados -> 'payment' ->> 'value')::numeric) * 100)::integer as valor,
          e.recebido_em as em
        from rest_privado.cobranca_eventos e
        where e.evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
          and e.recebido_em > now() - interval '120 days'
        order by e.dados -> 'payment' ->> 'id', e.recebido_em
      ) p
      left join public.assinaturas a on a.provedor_assinatura_id = p.assinatura
      left join public.restaurantes r on r.id = a.restaurante_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_financeiro() from public, anon;
grant execute on function public.admin_financeiro() to authenticated;

-- Ficha do restaurante: mostra quanto ele paga e até quando o valor está garantido.
create or replace function public.admin_restaurante_detalhes(p_restaurante_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fuso text;
  v_assinatura text;
begin
  perform rest_privado.exigir_admin();
  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;
  if v_fuso is null then
    return null;
  end if;
  select provedor_assinatura_id into v_assinatura from public.assinaturas where restaurante_id = p_restaurante_id;

  return jsonb_build_object(
    'cobranca', (
      select jsonb_build_object(
        'provedor', a.provedor, 'cliente_id', a.provedor_cliente_id, 'assinatura_id', a.provedor_assinatura_id,
        'fatura_url', a.fatura_url,
        -- Quanto este restaurante paga de verdade (null = ainda segue o preço de tabela do plano).
        'preco_centavos', a.preco_centavos,
        'preco_garantido_ate', a.preco_garantido_ate,
        'promocao', a.promocao,
        'eventos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'evento', e.evento, 'em', e.recebido_em,
            'valor', round(((e.dados -> 'payment' ->> 'value')::numeric) * 100)::integer,
            'vencimento', e.dados -> 'payment' ->> 'dueDate'
          ) order by e.recebido_em desc)
          from (
            select * from rest_privado.cobranca_eventos
            where v_assinatura is not null
              and coalesce(dados -> 'payment' ->> 'subscription', dados -> 'subscription' ->> 'id') = v_assinatura
            order by recebido_em desc limit 15
          ) e
        ), '[]'::jsonb)
      )
      from public.assinaturas a where a.restaurante_id = p_restaurante_id
    ),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia::date, 'pedidos', coalesce(x.pedidos, 0), 'vendido', coalesce(x.vendido, 0)) order by d.dia)
      from generate_series((now() at time zone v_fuso)::date - 29, (now() at time zone v_fuso)::date, interval '1 day') as d(dia)
      left join (
        select (criado_em at time zone v_fuso)::date as dia, count(*) as pedidos, sum(total) as vendido
        from public.pedidos
        where restaurante_id = p_restaurante_id and status <> 'cancelado' and criado_em > now() - interval '31 days'
        group by 1
      ) x on x.dia = d.dia::date
    ), '[]'::jsonb),
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object('texto', n.texto, 'em', n.criado_em, 'por', u.email) order by n.criado_em desc)
      from (select * from rest_privado.admin_notas where restaurante_id = p_restaurante_id order by criado_em desc limit 50) n
      left join auth.users u on u.id = n.user_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_restaurante_detalhes(uuid) from public, anon;
grant execute on function public.admin_restaurante_detalhes(uuid) to authenticated;
