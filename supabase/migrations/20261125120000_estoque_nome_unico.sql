-- Nome do item de estoque sem duplicata por maiúscula (teste de 25/11: dava para criar
-- "Coca lata" e "coca lata" como dois itens, cada um com o seu saldo).

alter table public.estoque_itens drop constraint estoque_itens_restaurante_id_nome_key;

create unique index estoque_itens_nome_unico
  on public.estoque_itens (restaurante_id, lower(btrim(nome)));
