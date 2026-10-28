-- Cardápio digital do salão (pedido do chefe: "cardápio digital para atendimento presencial").
-- O cliente na mesa aponta a câmera para o QR code e vê o cardápio, só para consulta (sem pedir).
-- Mostra o que está disponível no salão (produtos.disponivel), inclusive o que não vai para o
-- delivery; por isso não usa as políticas do site de delivery (que só abrem disponivel_delivery).
-- Devolve só o que já é público num cardápio: nomes, descrições, preços, fotos e opções.

create or replace function public.cardapio_salao_publico(p_restaurante_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(c.categoria order by c.ordem, c.nome), '[]'::jsonb)
  from (
    select cat.ordem, cat.nome, jsonb_build_object(
      'id', cat.id,
      'nome', cat.nome,
      'produtos', (
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'nome', p.nome,
          'descricao', p.descricao,
          'preco', p.preco,
          'foto_url', p.foto_url,
          'grupos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'nome', g.nome,
              'minimo', g.minimo,
              'maximo', g.maximo,
              'opcoes', (
                select jsonb_agg(jsonb_build_object('nome', a.nome, 'preco', a.preco) order by a.ordem, a.nome)
                from public.adicionais a
                where a.grupo_id = g.id and a.restaurante_id = p_restaurante_id and a.disponivel
              )
            ) order by g.ordem, g.nome)
            from public.produtos_grupos_adicionais pg
            join public.grupos_adicionais g on g.id = pg.grupo_id and g.restaurante_id = p_restaurante_id
            where pg.produto_id = p.id and pg.restaurante_id = p_restaurante_id and g.ativo
              and exists (select 1 from public.adicionais a where a.grupo_id = g.id and a.disponivel)
          ), '[]'::jsonb)
        ) order by p.ordem, p.nome)
        from public.produtos p
        where p.categoria_id = cat.id and p.restaurante_id = p_restaurante_id and p.disponivel
      )
    ) as categoria
    from public.categorias cat
    where cat.restaurante_id = p_restaurante_id
      and cat.ativa
      and rest_privado.restaurante_publico(p_restaurante_id)
      and exists (
        select 1 from public.produtos p
        where p.categoria_id = cat.id and p.restaurante_id = p_restaurante_id and p.disponivel
      )
  ) c;
$$;

revoke execute on function public.cardapio_salao_publico(uuid) from public;
grant execute on function public.cardapio_salao_publico(uuid) to anon, authenticated;
