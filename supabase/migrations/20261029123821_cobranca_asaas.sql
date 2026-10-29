-- Cobrança da assinatura pelo Asaas (decisão do cliente em 29/10, no lugar da Kiwify).
-- O dono escolhe o plano no painel; o servidor (chave secreta, depois de exigirDono) cria o cliente e
-- a assinatura no Asaas e abre a fatura (Pix, boleto ou cartão: o cliente escolhe). Os avisos do Asaas
-- (webhook) chegam em /api/asaas/webhook e passam pela função abaixo, que só a chave secreta chama.
-- Pagamento atrasado só avisa o dono (não bloqueia nada).

alter table public.assinaturas drop constraint assinaturas_provedor_check;
alter table public.assinaturas
  add constraint assinaturas_provedor_check check (provedor in ('kiwify', 'asaas')),
  add column provedor_cliente_id text,
  add column fatura_url text;

-- Cada aviso do Asaas uma vez só (ele reenvia quando não recebe 200).
create table rest_privado.cobranca_eventos (
  id text primary key,
  evento text not null,
  dados jsonb not null,
  recebido_em timestamptz not null default now()
);
alter table rest_privado.cobranca_eventos enable row level security;

create or replace function public.processar_evento_asaas(p_evento jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text := p_evento ->> 'event';
  v_pagamento jsonb := p_evento -> 'payment';
  v_assinatura_asaas text := coalesce(p_evento -> 'payment' ->> 'subscription', p_evento -> 'subscription' ->> 'id');
  v_vencimento date;
  v_linhas integer;
begin
  if coalesce(p_evento ->> 'id', '') = '' or v_tipo is null then
    raise exception 'Evento inválido.' using errcode = 'P0001';
  end if;

  insert into rest_privado.cobranca_eventos (id, evento, dados)
  values (p_evento ->> 'id', v_tipo, p_evento)
  on conflict (id) do nothing;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    return 'repetido';
  end if;

  if v_assinatura_asaas is null then
    return 'sem_assinatura';
  end if;

  if v_tipo in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
    -- Mensal: o período pago vai até o próximo vencimento.
    v_vencimento := coalesce((v_pagamento ->> 'dueDate')::date, current_date);
    update public.assinaturas
    set status = 'ativa',
        periodo_termina_em = greatest(coalesce(periodo_termina_em, now()), (v_vencimento + interval '1 month')::timestamptz),
        fatura_url = null,
        atualizado_em = now()
    where provedor = 'asaas' and provedor_assinatura_id = v_assinatura_asaas and status <> 'cortesia';
  elsif v_tipo = 'PAYMENT_OVERDUE' then
    update public.assinaturas
    set status = case when status = 'ativa' then 'atrasada' else status end,
        fatura_url = coalesce(v_pagamento ->> 'invoiceUrl', fatura_url),
        atualizado_em = now()
    where provedor = 'asaas' and provedor_assinatura_id = v_assinatura_asaas and status <> 'cortesia';
  elsif v_tipo = 'PAYMENT_CREATED' then
    -- Nova fatura do mês: guarda o link para o botão "Pagar".
    update public.assinaturas
    set fatura_url = coalesce(v_pagamento ->> 'invoiceUrl', fatura_url), atualizado_em = now()
    where provedor = 'asaas' and provedor_assinatura_id = v_assinatura_asaas;
  elsif v_tipo in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') then
    update public.assinaturas
    set status = 'cancelada', fatura_url = null, atualizado_em = now()
    where provedor = 'asaas' and provedor_assinatura_id = v_assinatura_asaas and status <> 'cortesia';
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.processar_evento_asaas(jsonb) from public, anon, authenticated;
grant execute on function public.processar_evento_asaas(jsonb) to service_role;
