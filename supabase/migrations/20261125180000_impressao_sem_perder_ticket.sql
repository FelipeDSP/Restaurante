-- Impressora offline: não perder ticket em silêncio, e não imprimir em dobro quando voltar.
--
-- A fila tentava 5 vezes esperando 10 s x tentativas (cerca de 2,5 min) e então o trabalho
-- virava `erro` e parava para sempre. Trocar a bobina numa noite cheia leva mais do que isso:
-- todos os tickets daquela janela morriam, a cozinha não era avisada, o caixa não era avisado,
-- e só o dono, abrindo Painel › Impressoras, via a fila com erro e reimprimia um a um.
--
-- Agora cada trabalho tem um prazo (`expira_em`, 30 min). Enquanto ele não vence, a fila
-- continua tentando, com espera crescente até 60 s — a impressora voltar depois de 10 minutos é
-- normal e o ticket sai sozinho. Vencido o prazo, vira `erro`, e aí a cozinha e o caixa avisam.
--
-- O prazo maior cria um risco novo: antes, um trabalho com falha morria em 2,5 min, então
-- "Reimprimir" sempre criava uma via nova sem risco. Com o trabalho ainda vivo na fila, a via
-- nova sairia junto com a original quando a impressora voltasse. Por isso `reimprimir` agora
-- só cria uma via nova quando o trabalho já foi impresso; se ele ainda está na fila ou em erro,
-- reaproveita a MESMA linha. "Reimprimir tudo que falhou" faz o mesmo em lote, o que também o
-- torna seguro de tocar duas vezes.

alter table public.fila_impressao
  add column expira_em timestamptz not null default (now() + interval '30 minutes');
comment on column public.fila_impressao.expira_em is
  'Até quando vale a pena tentar imprimir. Vencido, o trabalho vira erro e a equipe é avisada.';
update public.fila_impressao set expira_em = criado_em + interval '30 minutes';

-- Resultado de um trabalho. Falha volta para a fila (espera crescente, no máximo 60 s) enquanto
-- o prazo não vence; depois fica em erro e aparece na cozinha, no caixa e no painel.
create or replace function public.agente_concluir(p_agente_id uuid, p_fila_id uuid, p_ok boolean, p_erro text default null)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v public.fila_impressao;
begin
  select * into v from public.fila_impressao where id = p_fila_id and agente_id = p_agente_id;
  if v.id is null then
    return;
  end if;
  if p_ok then
    update public.fila_impressao set status = 'impresso', impresso_em = now(), erro = null where id = v.id;
    update public.impressoras set ultimo_sucesso_em = now(), ultimo_erro = null where id = v.impressora_id;
  else
    update public.fila_impressao
    set status = case when now() >= v.expira_em then 'erro' else 'pendente' end,
        erro = left(p_erro, 300), pego_em = null,
        tentar_depois_em = now() + make_interval(secs => least(60, 5 * v.tentativas))
    where id = v.id;
    update public.impressoras set ultimo_erro = left(p_erro, 300), ultimo_erro_em = now() where id = v.impressora_id;
  end if;
end;
$$;

-- Reimprimir uma via. Trabalho já impresso ganha uma via nova; trabalho ainda na fila ou em erro
-- volta a ser tentado na MESMA linha, para a impressora não soltar duas vias do mesmo ticket.
create or replace function public.reimprimir(p_fila_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v public.fila_impressao;
begin
  select * into v from public.fila_impressao where id = p_fila_id;
  if v.id is null or not rest_privado.eh_membro(v.restaurante_id) then
    raise exception 'Impressão não encontrada.' using errcode = 'P0001';
  end if;
  if v.status = 'impresso' then
    insert into public.fila_impressao (restaurante_id, impressora_id, tipo, tarefa_id, pedido_id, comanda_id, item_id)
    values (v.restaurante_id, v.impressora_id, v.tipo, v.tarefa_id, v.pedido_id, v.comanda_id, v.item_id);
  else
    update public.fila_impressao
    set status = 'pendente', erro = null, pego_em = null, agente_id = null,
        tentar_depois_em = null, expira_em = now() + interval '30 minutes'
    where id = v.id;
  end if;
end;
$$;

-- Quantos trabalhos desistiram de imprimir. Qualquer membro pode ver (a cozinha avisa na tela),
-- e é só uma contagem: a fila em si continua só para quem tem caixa_operar ou impressao.
create function public.impressoes_com_erro(p_restaurante_id uuid)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select case
    when rest_privado.eh_membro(p_restaurante_id)
      then (select count(*)::integer from public.fila_impressao
            where restaurante_id = p_restaurante_id and status = 'erro')
    else 0
  end;
$$;
revoke all on function public.impressoes_com_erro(uuid) from public, anon;
grant execute on function public.impressoes_com_erro(uuid) to authenticated;

-- "Reimprimir tudo que falhou": devolve os trabalhos em erro para a fila, na mesma linha.
-- Tocar duas vezes não duplica nada (na segunda não há mais nada em erro).
create function public.reimprimir_falhas(p_restaurante_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  if not rest_privado.tem_permissao(p_restaurante_id, array['caixa_operar', 'impressao']) then
    raise exception 'Sem permissão para reimprimir.' using errcode = '42501';
  end if;
  with voltaram as (
    update public.fila_impressao
    set status = 'pendente', erro = null, pego_em = null, agente_id = null,
        tentar_depois_em = null, expira_em = now() + interval '30 minutes'
    where restaurante_id = p_restaurante_id and status = 'erro'
    returning 1
  )
  select count(*)::integer into v_quantos from voltaram;
  return v_quantos;
end;
$$;
revoke all on function public.reimprimir_falhas(uuid) from public, anon;
grant execute on function public.reimprimir_falhas(uuid) to authenticated;
