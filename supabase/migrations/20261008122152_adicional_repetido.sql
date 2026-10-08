-- Adicional repetido: "2x arroz", "3x carne extra". O grupo diz se a mesma opção pode ser
-- escolhida mais de uma vez; o máximo do grupo passa a contar unidades. No retrato do item
-- a opção repetida aparece repetida (preço e soma continuam iguais); as telas agrupam.

alter table public.grupos_adicionais add column repetir boolean not null default false;

create or replace function rest_privado.montar_adicionais(p_restaurante_id uuid, p_produto_id uuid, p_escolhidos jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ids uuid[];        -- com repetição (2x arroz = o id duas vezes)
  v_distintos uuid[];
  v_encontrados integer;
  v_nome text;
  v_grupo record;
  v_qtd integer;
  v_itens jsonb;
  v_total integer;
begin
  if p_escolhidos is null or jsonb_typeof(p_escolhidos) = 'null' then
    p_escolhidos := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_escolhidos) <> 'array' or jsonb_array_length(p_escolhidos) > 30 then
    raise exception 'Adicionais inválidos.' using errcode = 'P0001';
  end if;

  begin
    select coalesce(array_agg((
             case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end
           )::uuid order by n), '{}')
    into v_ids
    from jsonb_array_elements(p_escolhidos) with ordinality as x(e, n);
  exception when others then
    raise exception 'Adicionais inválidos.' using errcode = 'P0001';
  end;
  if array_position(v_ids, null) is not null then
    raise exception 'Adicionais inválidos.' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_distintos from unnest(v_ids) u;

  -- Toda opção escolhida tem que ser de um grupo ligado a este produto.
  select count(*) into v_encontrados
  from public.adicionais a
  join public.produtos_grupos_adicionais pg
    on pg.grupo_id = a.grupo_id and pg.restaurante_id = a.restaurante_id and pg.produto_id = p_produto_id
  where a.id = any (v_distintos) and a.restaurante_id = p_restaurante_id;
  if v_encontrados <> cardinality(v_distintos) then
    raise exception 'Adicional não disponível para este produto.' using errcode = 'P0001';
  end if;

  select a.nome into v_nome
  from public.adicionais a
  join public.grupos_adicionais g on g.id = a.grupo_id
  where a.id = any (v_distintos) and (not a.disponivel or not g.ativo)
  limit 1;
  if v_nome is not null then
    raise exception 'Adicional indisponível: %.', v_nome using errcode = 'P0001';
  end if;

  -- Mínimo e máximo de cada grupo ativo do produto.
  for v_grupo in
    select g.id, g.nome, g.minimo, g.maximo, g.repetir
    from public.produtos_grupos_adicionais pg
    join public.grupos_adicionais g on g.id = pg.grupo_id and g.restaurante_id = pg.restaurante_id
    where pg.produto_id = p_produto_id and pg.restaurante_id = p_restaurante_id and g.ativo
  loop
    -- Conta unidades: com "repetir", 2x arroz conta 2 no máximo do grupo.
    select count(*) into v_qtd from unnest(v_ids) u join public.adicionais a on a.id = u where a.grupo_id = v_grupo.id;
    if not v_grupo.repetir and v_qtd > (
      select count(distinct u) from unnest(v_ids) u join public.adicionais a on a.id = u where a.grupo_id = v_grupo.id
    ) then
      raise exception 'Em "%", cada opção só pode ser escolhida uma vez.', v_grupo.nome using errcode = 'P0001';
    end if;
    if v_qtd < v_grupo.minimo then
      raise exception 'Escolha % em "%".',
        case when v_grupo.minimo = 1 then '1 opção' else v_grupo.minimo || ' opções' end, v_grupo.nome
        using errcode = 'P0001';
    end if;
    if v_qtd > v_grupo.maximo then
      raise exception 'Escolha no máximo % em "%".',
        case when v_grupo.maximo = 1 then '1 opção' else v_grupo.maximo || ' opções' end, v_grupo.nome
        using errcode = 'P0001';
    end if;
  end loop;

  select
    coalesce(jsonb_agg(
      jsonb_build_object('id', a.id, 'grupo_id', g.id, 'grupo', g.nome, 'nome', a.nome, 'preco', a.preco)
      order by g.ordem, g.nome, a.ordem, a.nome
    ), '[]'::jsonb),
    coalesce(sum(a.preco), 0)::integer
  into v_itens, v_total
  from unnest(v_ids) u
  join public.adicionais a on a.id = u
  join public.grupos_adicionais g on g.id = a.grupo_id;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end;
$$;


revoke all on function rest_privado.montar_adicionais(uuid, uuid, jsonb) from public, anon, authenticated;
