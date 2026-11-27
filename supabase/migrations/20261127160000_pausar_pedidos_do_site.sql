-- Um botão só para suspender o site (decisão do dono em 27/11: "retirada e delivery são meio
-- que um só").
--
-- Até agora `aceita_delivery` e `aceita_retirada` eram duas coisas ao mesmo tempo: o que a casa
-- oferece e se está recebendo agora. Com um botão só escrevendo nos dois, o restaurante que só
-- faz retirada voltaria a entregar ao despausar — o campo não lembra o que ele oferece.
--
-- Então os conceitos se separam:
--   * `aceita_delivery` / `aceita_retirada` = o que a casa faz. Configuração, muda quase nunca,
--     fica em Painel › Restaurante.
--   * `pedidos_pausados` = suspende tudo agora. Operação, um botão no quadro do Delivery.
--
-- Despausar devolve exatamente os jeitos que a casa oferece, sem inventar nenhum.

alter table public.restaurantes
  add column pedidos_pausados boolean not null default false;

grant select (pedidos_pausados) on public.restaurantes to anon, authenticated;
grant update (pedidos_pausados) on public.restaurantes to authenticated;

-- `entrega` e `retirada` passam a valer "dá para pedir assim agora": já descontam a pausa, e o
-- site não precisa cruzar duas informações. "pausado" é motivo próprio porque a mensagem ao
-- cliente é outra (não é que a casa não faça entrega — é que parou agora).
create or replace function public.consultar_disponibilidade_delivery(p_restaurante_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_restaurante public.restaurantes;
  v_fechado jsonb := jsonb_build_object('entrega', false, 'retirada', false);
begin
  select * into v_restaurante from public.restaurantes
  where id = p_restaurante_id and ativo and excluido_em is null;

  if v_restaurante.id is null or rest_privado.restaurante_suspenso(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'restaurante_indisponivel') || v_fechado;
  end if;
  if not v_restaurante.aceita_delivery and not v_restaurante.aceita_retirada then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_delivery') || v_fechado;
  end if;
  if v_restaurante.pedidos_pausados then
    return jsonb_build_object('aberto', false, 'motivo', 'pausado') || v_fechado;
  end if;
  if not rest_privado.esta_no_horario(p_restaurante_id) then
    return jsonb_build_object('aberto', false, 'motivo', 'fora_do_horario') || v_fechado;
  end if;
  if not exists (
    select 1 from public.caixa_sessoes where restaurante_id = p_restaurante_id and fechada_em is null
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'caixa_fechado') || v_fechado;
  end if;
  return jsonb_build_object(
    'aberto', true, 'motivo', null,
    'entrega', v_restaurante.aceita_delivery,
    'retirada', v_restaurante.aceita_retirada
  );
end;
$$;
