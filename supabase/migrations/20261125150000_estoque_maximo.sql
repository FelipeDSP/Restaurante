-- Estoque máximo (avisa quando comprou demais), como o concorrente tem. 0 = não avisa.

alter table public.estoque_itens
  add column maximo numeric(12,3) not null default 0 check (maximo >= 0);

grant insert (restaurante_id, nome, unidade, minimo, maximo) on public.estoque_itens to authenticated;
grant update (nome, unidade, minimo, maximo, ativo) on public.estoque_itens to authenticated;
