-- Endereço salvo guarda sempre o nome do bairro.
--
-- Até agora o nome só era guardado quando não havia `bairro_id` (modo taxa fixa); por bairro
-- ficava só o id. Desde que o site passou a mandar o bairro por texto (o CEP decide a taxa), o
-- checkout lê o nome para recalcular a taxa — e um endereço salvo sem o nome voltava sem bairro,
-- sem taxa e sem deixar pedir.
--
-- O id continua guardado: é ele que o painel e o histórico usam.

create or replace function rest_privado.pedidos_guardar_endereco()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.cliente_id is null or new.endereco is null or (new.bairro_id is null and coalesce(btrim(new.endereco ->> 'bairro'), '') = '') then
    return null;
  end if;

  insert into public.clientes_enderecos as e (restaurante_id, cliente_id, bairro_id, bairro, cep, cidade, uf, rua, numero, complemento, referencia)
  values (
    new.restaurante_id,
    new.cliente_id,
    new.bairro_id,
    -- Sempre o nome: é por ele que o checkout sabe quanto cobrar ao reusar o endereço.
    -- Sem o texto (pedido antigo), cai no nome do bairro da lista.
    coalesce(
      nullif(btrim(new.endereco ->> 'bairro'), ''),
      (select b.nome from public.bairros_entrega b where b.id = new.bairro_id)
    ),
    nullif(regexp_replace(coalesce(new.endereco ->> 'cep', ''), '\D', '', 'g'), ''),
    nullif(btrim(new.endereco ->> 'cidade'), ''),
    nullif(upper(btrim(new.endereco ->> 'uf')), ''),
    btrim(new.endereco ->> 'rua'),
    btrim(new.endereco ->> 'numero'),
    nullif(btrim(new.endereco ->> 'complemento'), ''),
    nullif(btrim(new.endereco ->> 'referencia'), '')
  )
  on conflict (restaurante_id, cliente_id, coalesce(bairro_id::text, lower(coalesce(bairro, ''))), lower(rua), lower(numero), lower(coalesce(complemento, '')))
  do update set
    usado_em = now(),
    referencia = excluded.referencia,
    cep = coalesce(excluded.cep, e.cep),
    -- Não troca o nome já guardado: o primeiro veio do CEP ("Jardim Novo"), e um pedido
    -- seguinte digitado à mão ("jardim novo") não deve estragá-lo. Só completa o que falta.
    bairro = coalesce(nullif(btrim(e.bairro), ''), excluded.bairro);

  delete from public.clientes_enderecos
  where cliente_id = new.cliente_id
    and id not in (
      select id from public.clientes_enderecos
      where cliente_id = new.cliente_id
      order by usado_em desc
      limit 5
    );
  return null;
end;
$$;

-- Endereços já guardados por bairro ficaram sem o nome: completa pela lista.
update public.clientes_enderecos e
   set bairro = b.nome
  from public.bairros_entrega b
 where e.bairro_id = b.id
   and coalesce(btrim(e.bairro), '') = '';
