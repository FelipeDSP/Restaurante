-- Garçom libera a mesa aberta por engano (sem itens valendo e sem pagamento): a comanda é cancelada
-- em vez de "fechada" com R$ 0 (não conta como conta no resumo). Antes só quem tinha
-- comandas_gerenciar cancelava; o garçom ficava com a mesa ocupada até o caixa liberar.

CREATE OR REPLACE FUNCTION rest_privado.comandas_antes_atualizar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Mesa aberta pelo cliente (QR code) fica sem garçom: quem atende pode assumir.
  if new.garcom_id is distinct from old.garcom_id
     and (select auth.uid()) is not null
     and not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar'])
     and not (old.garcom_id is null and new.garcom_id = rest_privado.membro_atual(new.restaurante_id)) then
    raise exception 'Sem permissão para trocar o garçom da mesa.' using errcode = 'P0001';
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
    -- Mesa sem consumo (abriu por engano): quem atende as mesas libera; com consumo, a regra abaixo
    -- já exige itens cancelados e pagamentos estornados.
    if not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar', 'garcom_app', 'comandas_painel']) then
      raise exception 'Sem permissão para cancelar a comanda.' using errcode = 'P0001';
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
$function$;
