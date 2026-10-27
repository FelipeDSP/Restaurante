-- O dono não é impedido: fecha o caixa mesmo com mesa aberta ou delivery em andamento
-- (decisão do cliente em 27/10). O que ficou aberto continua aberto e é recebido no próximo
-- caixa (o pagamento vai para a sessão aberta na hora). Para o resto da equipe, a trava continua.

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
    if not rest_privado.tem_papel(new.restaurante_id, array['dono']) then
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
