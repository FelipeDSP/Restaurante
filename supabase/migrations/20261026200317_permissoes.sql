-- Permissões por função e por pessoa (pedido do chefe: "liberação de módulos para o dono liberar por
-- pessoa e não apenas por perfil"; "funções com níveis de permissão, funções personalizadas, e
-- permissões tanto para funções quanto específicas para agentes").
--
-- * Permissões (a lista fica em rest_privado.permissoes_validas e em src/lib/auth/permissoes.ts):
--   operação: caixa_operar, caixa_estornar, delivery, comandas_painel, comandas_gerenciar, garcom_app, cozinha_tela
--   gestão:   relatorios, cardapio, mesas, cupons, entregadores, impressao, restaurante
-- * funcoes: cada restaurante tem as suas (nasce com Caixa, Garçom e Cozinha, iguais ao que os papéis
--   faziam); o dono edita e cria novas.
-- * membros.funcao_id + permissoes_extras (dadas só àquela pessoa) + permissoes_removidas (tiradas
--   só dela). Valem: (da função + extras) − removidas.
-- * O dono (membros.papel = 'dono') tem tudo; Equipe, Funções e Assinatura continuam só dele.
-- * O banco confere com rest_privado.tem_permissao(restaurante, permissoes[]) onde antes conferia
--   "dono" ou "dono ou caixa".

create function rest_privado.permissoes_validas()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    'caixa_operar', 'caixa_estornar', 'delivery', 'comandas_painel', 'comandas_gerenciar', 'garcom_app', 'cozinha_tela',
    'relatorios', 'cardapio', 'mesas', 'cupons', 'entregadores', 'impressao', 'restaurante'
  ];
$$;

-- Lista sem repetição, em ordem, só com permissões conhecidas (erro se vier outra).
create function rest_privado.normalizar_permissoes(p text[])
returns text[]
language plpgsql immutable
set search_path = ''
as $$
begin
  if not coalesce(p, '{}') <@ rest_privado.permissoes_validas() then
    raise exception 'Permissão desconhecida.' using errcode = 'P0001';
  end if;
  return array(select distinct x from unnest(coalesce(p, '{}')) as x order by 1);
end;
$$;

create table public.funcoes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  nome text not null check (length(btrim(nome)) between 2 and 40),
  permissoes text[] not null default '{}',
  -- Funções que o restaurante já ganha (caixa, garcom, cozinha): o cadastro antigo por papel acha a sua.
  padrao text check (padrao in ('caixa', 'garcom', 'cozinha')),
  criado_em timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, padrao)
);

create unique index funcoes_restaurante_nome on public.funcoes (restaurante_id, lower(btrim(nome)));

alter table public.funcoes enable row level security;
revoke all on public.funcoes from anon, authenticated;
grant select on public.funcoes to authenticated;
grant insert (restaurante_id, nome, permissoes) on public.funcoes to authenticated;
grant update (nome, permissoes) on public.funcoes to authenticated;
grant delete on public.funcoes to authenticated;

create policy funcoes_ler on public.funcoes
  for select to authenticated
  using ((select rest_privado.eh_membro(restaurante_id)));
create policy funcoes_criar on public.funcoes
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
create policy funcoes_alterar on public.funcoes
  for update to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])))
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono'])));
-- Excluir só função sem ninguém (a chave estrangeira de membros barra a que está em uso).
create policy funcoes_excluir on public.funcoes
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

create function rest_privado.funcoes_regras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nome := btrim(new.nome);
  new.permissoes := rest_privado.normalizar_permissoes(new.permissoes);
  if tg_op = 'UPDATE' then
    new.padrao := old.padrao;
    new.restaurante_id := old.restaurante_id;
  end if;
  return new;
end;
$$;

create trigger t01_regras
before insert or update on public.funcoes
for each row execute function rest_privado.funcoes_regras();

-- Funções que todo restaurante ganha: o que caixa, garçom e cozinha faziam até aqui.
create function rest_privado.criar_funcoes_padrao(p_restaurante_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.funcoes (restaurante_id, nome, permissoes, padrao) values
    (p_restaurante_id, 'Caixa',
     array['caixa_operar', 'caixa_estornar', 'delivery', 'comandas_painel', 'comandas_gerenciar', 'garcom_app', 'cozinha_tela'], 'caixa'),
    (p_restaurante_id, 'Garçom', array['garcom_app'], 'garcom'),
    (p_restaurante_id, 'Cozinha', array['cozinha_tela'], 'cozinha')
  on conflict (restaurante_id, padrao) do nothing;
$$;

create function rest_privado.restaurantes_funcoes_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform rest_privado.criar_funcoes_padrao(new.id);
  return new;
end;
$$;

create trigger t90_funcoes_padrao
after insert on public.restaurantes
for each row execute function rest_privado.restaurantes_funcoes_padrao();

select rest_privado.criar_funcoes_padrao(id) from public.restaurantes;

-- ---------------------------------------------------------------------------
-- membros: função + ajustes da pessoa
-- ---------------------------------------------------------------------------

alter table public.membros drop constraint membros_papel_check;
alter table public.membros add constraint membros_papel_check check (papel in ('dono', 'caixa', 'garcom', 'cozinha', 'equipe'));

alter table public.membros
  add column funcao_id uuid,
  add column permissoes_extras text[] not null default '{}',
  add column permissoes_removidas text[] not null default '{}',
  add foreign key (restaurante_id, funcao_id) references public.funcoes (restaurante_id, id);

create index membros_restaurante_funcao on public.membros (restaurante_id, funcao_id) where funcao_id is not null;

update public.membros m set funcao_id = f.id
from public.funcoes f
where f.restaurante_id = m.restaurante_id and f.padrao = m.papel and m.papel <> 'dono';

-- Dono: sem função nem ajustes. Equipe: cadastro antigo só com o papel ganha a função equivalente;
-- toda pessoa da equipe tem uma função.
create function rest_privado.membros_funcao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.papel = 'dono' then
    new.funcao_id := null;
    new.permissoes_extras := '{}';
    new.permissoes_removidas := '{}';
    return new;
  end if;
  if new.funcao_id is null and new.papel in ('caixa', 'garcom', 'cozinha') then
    select id into new.funcao_id from public.funcoes where restaurante_id = new.restaurante_id and padrao = new.papel;
  end if;
  if new.funcao_id is null then
    raise exception 'Escolha a função da pessoa.' using errcode = 'P0001';
  end if;
  new.permissoes_extras := rest_privado.normalizar_permissoes(new.permissoes_extras);
  new.permissoes_removidas := rest_privado.normalizar_permissoes(new.permissoes_removidas);
  return new;
end;
$$;

create trigger t02_funcao
before insert or update of papel, funcao_id, permissoes_extras, permissoes_removidas on public.membros
for each row execute function rest_privado.membros_funcao();

grant update (funcao_id, permissoes_extras, permissoes_removidas) on public.membros to authenticated;

-- Permissões que valem para um membro ativo (dono: todas).
create function rest_privado.permissoes_membro(p_membro_id uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when m.papel = 'dono' then rest_privado.permissoes_validas()
    else array(
      select distinct x
      from unnest(coalesce(f.permissoes, '{}') || m.permissoes_extras) as x
      where not x = any (m.permissoes_removidas)
      order by 1
    )
  end
  from public.membros m
  left join public.funcoes f on f.id = m.funcao_id
  where m.id = p_membro_id and m.ativo;
$$;

-- O usuário logado tem alguma destas permissões no restaurante?
create function rest_privado.tem_permissao(p_restaurante_id uuid, p_permissoes text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membros m
    join public.restaurantes r on r.id = m.restaurante_id
    where m.restaurante_id = p_restaurante_id
      and m.user_id = (select auth.uid())
      and m.ativo
      and r.excluido_em is null
      and rest_privado.permissoes_membro(m.id) && p_permissoes
  );
$$;

-- As permissões do próprio usuário (o app usa para montar menu e telas).
create function public.minhas_permissoes(p_restaurante_id uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select rest_privado.permissoes_membro(m.id)
    from public.membros m
    where m.restaurante_id = p_restaurante_id and m.user_id = (select auth.uid()) and m.ativo
  ), '{}');
$$;

revoke all on function rest_privado.permissoes_validas() from public, anon;
revoke all on function rest_privado.normalizar_permissoes(text[]) from public, anon, authenticated;
revoke all on function rest_privado.criar_funcoes_padrao(uuid) from public, anon, authenticated;
revoke all on function rest_privado.restaurantes_funcoes_padrao() from public, anon, authenticated;
revoke all on function rest_privado.funcoes_regras() from public, anon, authenticated;
revoke all on function rest_privado.membros_funcao() from public, anon, authenticated;
revoke all on function rest_privado.permissoes_membro(uuid) from public, anon, authenticated;
revoke all on function rest_privado.tem_permissao(uuid, text[]) from public, anon;
grant execute on function rest_privado.tem_permissao(uuid, text[]) to authenticated;
grant execute on function rest_privado.permissoes_validas() to authenticated;
revoke all on function public.minhas_permissoes(uuid) from public, anon;
grant execute on function public.minhas_permissoes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Funções: "dono" / "dono ou caixa" viram a permissão da tarefa.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rest_privado.pedidos_campos_fixos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not rest_privado.edicao_autorizada(new.id) and (
     new.taxa_entrega is distinct from old.taxa_entrega
     or new.bairro_id is distinct from old.bairro_id
     or new.endereco is distinct from old.endereco
     or new.cliente_nome is distinct from old.cliente_nome
     or new.cliente_telefone is distinct from old.cliente_telefone
     or new.forma_pagamento_prevista is distinct from old.forma_pagamento_prevista
     or new.troco_para is distinct from old.troco_para
     or new.chave_idempotencia is distinct from old.chave_idempotencia
     or new.observacao is distinct from old.observacao
     -- cliente_id só pode sumir (conta do cliente excluída: a FK faz "set null").
     or (new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null)) then
    raise exception 'Os dados do pedido não podem ser alterados.' using errcode = 'P0001';
  end if;
  -- Nem a edição troca a chave do envio nem o cliente da conta.
  if new.chave_idempotencia is distinct from old.chave_idempotencia
     or (new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null) then
    raise exception 'Os dados do pedido não podem ser alterados.' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if new.origem = 'delivery'
       and (select auth.uid()) is not null
       and not (old.status = 'em_preparo' and new.status = 'pronto')
       and not rest_privado.tem_permissao(new.restaurante_id, array['delivery']) then
      raise exception 'Sem permissão para mudar o andamento do delivery.' using errcode = 'P0001';
    end if;

    if new.status = 'cancelado' and exists (
      select 1 from public.pagamentos where pedido_id = new.id and estornado_em is null
    ) then
      raise exception 'Estorne o pagamento antes de cancelar o pedido.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.editar_pedido_delivery(p_pedido_id uuid, p_campos jsonb DEFAULT '{}'::jsonb, p_remover uuid[] DEFAULT '{}'::uuid[], p_adicionar jsonb DEFAULT '[]'::jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pedido public.pedidos;
  v_novo public.pedidos;
  v_membro uuid;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'Alterado pelo restaurante');
  v_log text[] := '{}';
  v_item jsonb;
  v_nome text;
  v_qtd integer;
  v_endereco jsonb;
  v_chave text;
  v_pago integer;
  v_removido record;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if v_pedido.id is null or v_pedido.origem <> 'delivery'
     or not rest_privado.tem_permissao(v_pedido.restaurante_id, array['delivery']) then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_pedido.status in ('entregue', 'cancelado') then
    raise exception 'Pedido já finalizado: não dá mais para editar.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_campos, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_adicionar, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_adicionar, '[]'::jsonb)) > 30 or coalesce(array_length(p_remover, 1), 0) > 50 then
    raise exception 'Dados inválidos.' using errcode = 'P0001';
  end if;
  if length(v_motivo) > 200 then
    raise exception 'Motivo muito longo.' using errcode = 'P0001';
  end if;

  v_membro := rest_privado.membro_atual(v_pedido.restaurante_id);
  perform set_config('rest.edicao_pedido', p_pedido_id::text, true);
  v_novo := v_pedido;

  -- Campos do pedido.
  if p_campos ? 'cliente_nome' then
    v_novo.cliente_nome := btrim(p_campos ->> 'cliente_nome');
    if length(coalesce(v_novo.cliente_nome, '')) not between 2 and 120 then
      raise exception 'Informe o nome do cliente.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'cliente_telefone' then
    v_novo.cliente_telefone := regexp_replace(coalesce(p_campos ->> 'cliente_telefone', ''), '\D', '', 'g');
    if length(v_novo.cliente_telefone) not between 10 and 13 then
      raise exception 'Telefone inválido.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'endereco' then
    if jsonb_typeof(p_campos -> 'endereco') <> 'object' then
      raise exception 'Endereço inválido.' using errcode = 'P0001';
    end if;
    -- Só as chaves conhecidas, texto curto; mantém as que não vieram.
    v_endereco := coalesce(v_pedido.endereco, '{}'::jsonb);
    foreach v_chave in array array['rua', 'numero', 'complemento', 'referencia', 'bairro', 'cep', 'cidade', 'uf'] loop
      if (p_campos -> 'endereco') ? v_chave then
        if length(coalesce(p_campos -> 'endereco' ->> v_chave, '')) > 200 then
          raise exception 'Endereço muito longo.' using errcode = 'P0001';
        end if;
        v_endereco := case
          when coalesce(btrim(p_campos -> 'endereco' ->> v_chave), '') = '' then v_endereco - v_chave
          else jsonb_set(v_endereco, array[v_chave], to_jsonb(btrim(p_campos -> 'endereco' ->> v_chave)))
        end;
      end if;
    end loop;
    if coalesce(v_endereco ->> 'rua', '') = '' or coalesce(v_endereco ->> 'numero', '') = '' then
      raise exception 'Informe rua e número.' using errcode = 'P0001';
    end if;
    v_novo.endereco := v_endereco;
  end if;
  if p_campos ? 'bairro_id' then
    v_novo.bairro_id := nullif(p_campos ->> 'bairro_id', '')::uuid;
    if v_novo.bairro_id is not null and not exists (
      select 1 from public.bairros_entrega where id = v_novo.bairro_id and restaurante_id = v_pedido.restaurante_id and ativo
    ) then
      raise exception 'Bairro inválido.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'taxa_entrega' then
    v_novo.taxa_entrega := (p_campos ->> 'taxa_entrega')::integer;
    if v_novo.taxa_entrega is null or v_novo.taxa_entrega not between 0 and 100000 then
      raise exception 'Taxa de entrega inválida.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'forma_pagamento_prevista' then
    v_novo.forma_pagamento_prevista := p_campos ->> 'forma_pagamento_prevista';
    if v_novo.forma_pagamento_prevista not in ('dinheiro', 'pix', 'credito', 'debito', 'outro') then
      raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
    end if;
  end if;
  if p_campos ? 'troco_para' then
    v_novo.troco_para := nullif(p_campos ->> 'troco_para', '')::integer;
  end if;
  if v_novo.forma_pagamento_prevista <> 'dinheiro' then
    v_novo.troco_para := null;
  end if;
  if p_campos ? 'observacao' then
    v_novo.observacao := nullif(btrim(p_campos ->> 'observacao'), '');
    if length(coalesce(v_novo.observacao, '')) > 500 then
      raise exception 'Observação muito longa.' using errcode = 'P0001';
    end if;
  end if;

  if v_novo.cliente_nome is distinct from v_pedido.cliente_nome then
    v_log := v_log || format('Nome: %s → %s', v_pedido.cliente_nome, v_novo.cliente_nome);
  end if;
  if v_novo.cliente_telefone is distinct from v_pedido.cliente_telefone then
    v_log := v_log || format('Telefone: %s → %s', v_pedido.cliente_telefone, v_novo.cliente_telefone);
  end if;
  if v_novo.endereco is distinct from v_pedido.endereco or v_novo.bairro_id is distinct from v_pedido.bairro_id then
    v_log := v_log || 'Endereço alterado'::text;
  end if;
  if v_novo.taxa_entrega is distinct from v_pedido.taxa_entrega then
    v_log := v_log || format('Taxa de entrega: R$ %s → R$ %s',
      replace(to_char(v_pedido.taxa_entrega / 100.0, 'FM999990.00'), '.', ','), replace(to_char(v_novo.taxa_entrega / 100.0, 'FM999990.00'), '.', ','));
  end if;
  if v_novo.forma_pagamento_prevista is distinct from v_pedido.forma_pagamento_prevista
     or v_novo.troco_para is distinct from v_pedido.troco_para then
    v_log := v_log || 'Pagamento alterado'::text;
  end if;
  if v_novo.observacao is distinct from v_pedido.observacao then
    v_log := v_log || 'Observação alterada'::text;
  end if;

  update public.pedidos
  set cliente_nome = v_novo.cliente_nome,
      cliente_telefone = v_novo.cliente_telefone,
      endereco = v_novo.endereco,
      bairro_id = v_novo.bairro_id,
      taxa_entrega = v_novo.taxa_entrega,
      forma_pagamento_prevista = v_novo.forma_pagamento_prevista,
      troco_para = v_novo.troco_para,
      observacao = v_novo.observacao
  where id = p_pedido_id;

  -- Itens que saem.
  for v_removido in
    update public.itens_pedido
    set cancelado_em = now(), motivo_cancelamento = v_motivo
    where pedido_id = p_pedido_id and id = any (coalesce(p_remover, '{}')) and cancelado_em is null
    returning quantidade, nome_produto
  loop
    v_log := v_log || format('Removido: %s× %s', v_removido.quantidade, v_removido.nome_produto);
  end loop;

  -- Itens que entram (preço, opções e rota vêm do cadastro, pelo trigger).
  for v_item in select * from jsonb_array_elements(coalesce(p_adicionar, '[]'::jsonb)) loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd not between 1 and 99 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    if length(coalesce(v_item ->> 'observacao', '')) > 300 then
      raise exception 'Observação do item muito longa.' using errcode = 'P0001';
    end if;
    insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, observacao, adicionais)
    values (v_pedido.restaurante_id, p_pedido_id, (v_item ->> 'produto_id')::uuid, '', 0, v_qtd,
            nullif(btrim(v_item ->> 'observacao'), ''), coalesce(v_item -> 'adicionais', '[]'::jsonb))
    returning nome_produto into v_nome;
    v_log := v_log || format('Adicionado: %s× %s', v_qtd, v_nome);
  end loop;

  if not exists (select 1 from public.itens_pedido where pedido_id = p_pedido_id and cancelado_em is null) then
    raise exception 'O pedido precisa ter pelo menos um item. Para desistir, cancele o pedido.' using errcode = 'P0001';
  end if;

  select * into v_novo from public.pedidos where id = p_pedido_id;
  if v_novo.forma_pagamento_prevista = 'dinheiro' and v_novo.troco_para is not null and v_novo.troco_para < v_novo.total then
    raise exception 'O troco precisa ser para um valor maior que o total (R$ %).',
      replace(to_char(v_novo.total / 100.0, 'FM999990.00'), '.', ',') using errcode = 'P0001';
  end if;
  select coalesce(sum(valor), 0) into v_pago from public.pagamentos where pedido_id = p_pedido_id and estornado_em is null;
  if v_pago > v_novo.total then
    raise exception 'O total ficaria menor que o já pago. Estorne o pagamento antes.' using errcode = 'P0001';
  end if;

  if array_length(v_log, 1) is null then
    raise exception 'Nada foi alterado.' using errcode = 'P0001';
  end if;
  insert into public.pedidos_alteracoes (restaurante_id, pedido_id, membro_id, descricao)
  select v_pedido.restaurante_id, p_pedido_id, v_membro, linha from unnest(v_log) as linha;

  perform set_config('rest.edicao_pedido', '', true);
  return jsonb_build_object('total', v_novo.total, 'alteracoes', to_jsonb(v_log));
end;
$function$;

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

  if new.garcom_id is distinct from old.garcom_id
     and (select auth.uid()) is not null
     and not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar']) then
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
    if not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar']) then
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

CREATE OR REPLACE FUNCTION rest_privado.comandas_antes_inserir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membro uuid := rest_privado.membro_atual(new.restaurante_id);
  v_r record;
begin
  new.caixa_sessao_id := rest_privado.caixa_aberto(new.restaurante_id);

  if not exists (
    select 1 from public.mesas
    where id = new.mesa_id and restaurante_id = new.restaurante_id and ativa
  ) then
    raise exception 'Mesa inválida ou inativa.' using errcode = 'P0001';
  end if;

  -- Quem não gerencia as mesas abre em seu próprio nome; quem gerencia pode indicar o garçom.
  if (select auth.uid()) is not null and not rest_privado.tem_permissao(new.restaurante_id, array['comandas_gerenciar']) then
    new.garcom_id := v_membro;
  else
    new.garcom_id := coalesce(new.garcom_id, v_membro);
  end if;

  -- Serviço e couvert do momento em que a mesa abre.
  select servico_percentual, couvert_valor, couvert_dias, fuso_horario into v_r
  from public.restaurantes where id = new.restaurante_id;
  new.servico_percentual := v_r.servico_percentual;
  new.cobrar_servico := v_r.servico_percentual > 0;
  new.couvert_unitario := v_r.couvert_valor;
  new.cobrar_couvert := v_r.couvert_valor > 0
    and extract(dow from now() at time zone v_r.fuso_horario)::smallint = any (v_r.couvert_dias);

  new.status := 'aberta';
  new.subtotal := 0;
  new.servico := 0;
  new.couvert := case when new.cobrar_couvert then new.couvert_unitario * coalesce(new.pessoas, 0) else 0 end;
  new.total := new.couvert;
  new.aberta_em := now();
  new.fechada_em := null;
  new.fechada_por := null;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION rest_privado.pedidos_entregador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_e public.entregadores;
begin
  if tg_op = 'INSERT' then
    new.entregador_id := null;
    new.valor_entregador := 0;
    return new;
  end if;

  if new.entregador_id is distinct from old.entregador_id then
    if new.origem <> 'delivery' then
      raise exception 'Só pedido de delivery tem entregador.' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null and not rest_privado.tem_permissao(new.restaurante_id, array['delivery']) then
      raise exception 'Sem permissão para escolher o entregador.' using errcode = 'P0001';
    end if;
    if old.status in ('entregue', 'cancelado') then
      raise exception 'Pedido já finalizado.' using errcode = 'P0001';
    end if;
  end if;

  if new.entregador_id is null then
    new.valor_entregador := 0;
  elsif new.entregador_id is distinct from old.entregador_id or new.taxa_entrega is distinct from old.taxa_entrega then
    select * into v_e from public.entregadores where id = new.entregador_id and restaurante_id = new.restaurante_id;
    if v_e.id is null or (new.entregador_id is distinct from old.entregador_id and not v_e.ativo) then
      raise exception 'Entregador inválido.' using errcode = 'P0001';
    end if;
    new.valor_entregador := case when v_e.recebe_taxa then new.taxa_entrega else v_e.valor_por_entrega end;
  else
    new.valor_entregador := old.valor_entregador;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.imprimir_teste(p_impressora_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_restaurante_id uuid;
begin
  select restaurante_id into v_restaurante_id from public.impressoras where id = p_impressora_id;
  if v_restaurante_id is null or not rest_privado.tem_permissao(v_restaurante_id, array['caixa_operar', 'impressao']) then
    raise exception 'Impressora não encontrada.' using errcode = 'P0001';
  end if;
  insert into public.fila_impressao (restaurante_id, impressora_id, tipo)
  values (v_restaurante_id, p_impressora_id, 'teste');
end;
$function$;

CREATE OR REPLACE FUNCTION public.relatorio_vendas(p_restaurante_id uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_fuso text;
  v_resultado jsonb;
begin
  if not (select rest_privado.tem_permissao(p_restaurante_id, array['relatorios'])) then
    raise exception 'Sem permissão para ver os relatórios.' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;

  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;

  with
  sessoes as (
    select s.id, s.aberta_em
    from public.caixa_sessoes s
    where s.restaurante_id = p_restaurante_id
      and (s.aberta_em at time zone v_fuso)::date between p_de and p_ate
  ),
  pedidos as (
    select p.*
    from public.pedidos p
    where p.restaurante_id = p_restaurante_id
      and p.caixa_sessao_id in (select id from sessoes)
  ),
  validos as (
    select * from pedidos where status <> 'cancelado'
  ),
  vendidos as (
    select i.*, p.origem, p.criado_em as pedido_em, p.caixa_sessao_id
    from public.itens_pedido i
    join validos p on p.id = i.pedido_id
    where i.restaurante_id = p_restaurante_id and i.cancelado_em is null
  ),
  -- Vendido por pedido (itens + taxa): base de origem, horário e bairro.
  por_pedido as (
    select p.id, p.origem, p.criado_em, p.caixa_sessao_id, p.bairro_id, p.endereco ->> 'bairro' as bairro_texto, p.taxa_entrega, p.comanda_id,
      coalesce((select sum(v.total) from vendidos v where v.pedido_id = p.id), 0) + p.taxa_entrega - p.desconto as vendido
    from validos p
  ),
  comandas as (
    select c.*
    from public.comandas c
    where c.restaurante_id = p_restaurante_id
      and c.caixa_sessao_id in (select id from sessoes)
  ),
  pagamentos as (
    select pg.*
    from public.pagamentos pg
    where pg.restaurante_id = p_restaurante_id
      and pg.caixa_sessao_id in (select id from sessoes)
  ),
  recebidos as (
    select * from pagamentos where estornado_em is null
  ),
  -- Contas = comandas fechadas + pedidos de delivery/balcão (pedidos de mesa são vários por comanda).
  contas_sessao as (
    select s.id,
      (select count(*) from comandas c where c.caixa_sessao_id = s.id and c.status = 'fechada')
      + (select count(*) from validos p where p.caixa_sessao_id = s.id and p.origem <> 'mesa') as contas
    from sessoes s
  )
  select jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'fuso', v_fuso,
    'sessoes', (select count(*) from sessoes),
    'vendido', coalesce((select sum(vendido) from por_pedido), 0),
    'recebido', coalesce((select sum(valor) from recebidos), 0),
    'contas', coalesce((select sum(contas) from contas_sessao), 0),
    'itens', coalesce((select sum(quantidade) from vendidos), 0),
    'taxas_entrega', coalesce((select sum(taxa_entrega) from validos), 0),
    'descontos', coalesce((select sum(desconto) from validos), 0),
    'servico', coalesce((select sum(servico) from comandas where status = 'fechada'), 0),
    'couvert', coalesce((select sum(couvert) from comandas where status = 'fechada'), 0),
    'pedidos_cancelados', jsonb_build_object(
      'quantidade', (select count(*) from pedidos where status = 'cancelado'),
      'valor', coalesce((select sum(total) from pedidos where status = 'cancelado'), 0)
    ),
    'itens_cancelados', jsonb_build_object(
      'quantidade', coalesce((
        select sum(i.quantidade) from public.itens_pedido i join validos p on p.id = i.pedido_id
        where i.restaurante_id = p_restaurante_id and i.cancelado_em is not null
      ), 0),
      'valor', coalesce((
        select sum(i.total) from public.itens_pedido i join validos p on p.id = i.pedido_id
        where i.restaurante_id = p_restaurante_id and i.cancelado_em is not null
      ), 0)
    ),
    'estornos', jsonb_build_object(
      'quantidade', (select count(*) from pagamentos where estornado_em is not null),
      'valor', coalesce((select sum(valor) from pagamentos where estornado_em is not null), 0)
    ),
    'por_sessao', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'aberta_em', s.aberta_em,
        'vendido', coalesce((select sum(vendido) from por_pedido p where p.caixa_sessao_id = s.id), 0),
        'contas', (select contas from contas_sessao c where c.id = s.id)
      ) order by s.aberta_em)
      from sessoes s
    ), '[]'::jsonb),
    -- Dia da semana da noite (0 = domingo), com quantas noites para tirar a média.
    'por_dia_semana', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'noites', noites, 'vendido', vendido) order by dia)
      from (
        select extract(dow from s.aberta_em at time zone v_fuso)::int as dia,
          count(*) as noites,
          coalesce(sum((select sum(vendido) from por_pedido p where p.caixa_sessao_id = s.id)), 0) as vendido
        from sessoes s
        group by 1
      ) x
    ), '[]'::jsonb),
    -- Hora em que o pedido foi lançado (no fuso do restaurante).
    'por_hora', coalesce((
      select jsonb_agg(jsonb_build_object('hora', hora, 'pedidos', pedidos, 'vendido', vendido) order by hora)
      from (
        select extract(hour from p.criado_em at time zone v_fuso)::int as hora, count(*) as pedidos, sum(p.vendido) as vendido
        from por_pedido p
        group by 1
      ) x
    ), '[]'::jsonb),
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'pedidos', pedidos, 'vendido', vendido) order by vendido desc)
      from (
        select p.origem,
          case when p.origem = 'mesa' then count(distinct p.comanda_id) else count(*) end as pedidos,
          sum(p.vendido) as vendido
        from por_pedido p
        group by p.origem
      ) x
    ), '[]'::jsonb),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'quantidade', quantidade, 'valor', valor) order by valor desc)
      from (select forma, count(*) as quantidade, sum(valor) as valor from recebidos group by forma) x
    ), '[]'::jsonb),
    -- Por produto (o nome é o mais recente lançado; a categoria é a atual do produto).
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'produto_id', produto_id, 'nome', nome, 'categoria', categoria, 'quantidade', quantidade, 'total', total
      ) order by quantidade desc, total desc)
      from (
        select v.produto_id,
          (array_agg(v.nome_produto order by v.criado_em desc))[1] as nome,
          (select c.nome from public.produtos pr join public.categorias c on c.id = pr.categoria_id where pr.id = v.produto_id) as categoria,
          sum(v.quantidade) as quantidade,
          sum(v.total) as total
        from vendidos v
        group by v.produto_id
      ) x
    ), '[]'::jsonb),
    'bairros', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'pedidos', pedidos, 'vendido', vendido, 'taxas', taxas) order by pedidos desc, vendido desc)
      from (
        select coalesce(b.nome, initcap(nullif(btrim(p.bairro_texto), '')), 'Sem bairro') as nome, count(*) as pedidos, sum(p.vendido) as vendido, sum(p.taxa_entrega) as taxas
        from por_pedido p
        left join public.bairros_entrega b on b.id = p.bairro_id
        where p.origem = 'delivery'
        group by 1
      ) x
    ), '[]'::jsonb),
    'garcons', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'comandas', comandas, 'vendido', vendido, 'pessoas', pessoas, 'servico', servico) order by vendido desc)
      from (
        select coalesce(m.nome, 'Sem garçom') as nome, count(*) as comandas, sum(c.subtotal) as vendido, sum(c.pessoas) as pessoas,
          sum(c.servico) as servico
        from comandas c
        left join public.membros m on m.id = c.garcom_id
        where c.status = 'fechada'
        group by 1
      ) x
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;

CREATE OR REPLACE FUNCTION public.entregas_do_periodo(p_restaurante_id uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_fuso text;
begin
  if not (select rest_privado.tem_permissao(p_restaurante_id, array['relatorios'])) then
    raise exception 'Sem permissão para ver os relatórios.' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;
  select fuso_horario into v_fuso from public.restaurantes where id = p_restaurante_id;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'entregas', entregas, 'valor', valor) order by entregas desc), '[]'::jsonb)
    from (
      select e.nome, count(*) as entregas, sum(p.valor_entregador) as valor
      from public.pedidos p
      join public.caixa_sessoes s on s.id = p.caixa_sessao_id
      join public.entregadores e on e.id = p.entregador_id
      where p.restaurante_id = p_restaurante_id
        and p.status <> 'cancelado'
        and (s.aberta_em at time zone v_fuso)::date between p_de and p_ate
      group by e.nome
    ) x
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.definir_codigo_pareamento(p_agente_id uuid, p_codigo_hash text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_restaurante uuid;
  v_expira timestamptz := case when p_codigo_hash is null then null else now() + interval '10 minutes' end;
begin
  select restaurante_id into v_restaurante from public.agentes_impressao where id = p_agente_id;
  if v_restaurante is null or not rest_privado.tem_permissao(v_restaurante, array['impressao']) then
    raise exception 'Computador não encontrado.' using errcode = 'P0001';
  end if;
  if p_codigo_hash is not null and p_codigo_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Código inválido.' using errcode = 'P0001';
  end if;

  update public.agentes_impressao
  set codigo_hash = p_codigo_hash,
      codigo_expira_em = v_expira,
      ativo = case when p_codigo_hash is null then ativo else true end
  where id = p_agente_id;
  return v_expira;
end;
$function$;

CREATE OR REPLACE FUNCTION rest_privado.chamados_garcom_regras()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    new.recado := nullif(btrim(coalesce(new.recado, '')), '');
    new.chamado_por := rest_privado.membro_atual(new.restaurante_id);
    new.criado_em := now();
    new.atendido_em := null;
    if not exists (
      select 1 from public.membros m
      where m.id = new.garcom_id and m.restaurante_id = new.restaurante_id and m.ativo and m.papel <> 'dono' and 'garcom_app' = any (rest_privado.permissoes_membro(m.id))
    ) then
      raise exception 'Garçom não encontrado.' using errcode = 'P0001';
    end if;
    -- Evita chamar em rajada (toque repetido, script).
    if (
      select count(*) from public.chamados_garcom c
      where c.restaurante_id = new.restaurante_id and c.criado_em > now() - interval '1 minute'
    ) >= 20 then
      raise exception 'Muitos chamados seguidos. Espere um pouco.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE: só "recebido", uma vez; a hora vem do banco.
  new.atendido_em := coalesce(old.atendido_em, now());
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Políticas: o mesmo, por permissão (Equipe e Assinatura continuam só do dono).
-- ---------------------------------------------------------------------------

alter policy "dono apaga adicionais" on public.adicionais
  using (( SELECT rest_privado.tem_permissao(adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono cria adicionais" on public.adicionais
  with check (( SELECT rest_privado.tem_permissao(adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono edita adicionais" on public.adicionais
  using (( SELECT rest_privado.tem_permissao(adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono cria computadores" on public.agentes_impressao
  with check (( SELECT rest_privado.tem_permissao(agentes_impressao.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono e caixa veem computadores" on public.agentes_impressao
  using (( SELECT rest_privado.tem_permissao(agentes_impressao.restaurante_id, ARRAY['caixa_operar'::text, 'impressao'::text]) AS tem_permissao));

alter policy "dono edita computadores" on public.agentes_impressao
  using (( SELECT rest_privado.tem_permissao(agentes_impressao.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(agentes_impressao.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono exclui computadores" on public.agentes_impressao
  using (( SELECT rest_privado.tem_permissao(agentes_impressao.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono apaga bairros" on public.bairros_entrega
  using (( SELECT rest_privado.tem_permissao(bairros_entrega.restaurante_id, ARRAY['restaurante'::text]) AS tem_permissao));

alter policy "dono cria bairros" on public.bairros_entrega
  with check (( SELECT rest_privado.tem_permissao(bairros_entrega.restaurante_id, ARRAY['restaurante'::text]) AS tem_permissao));

alter policy "dono edita bairros" on public.bairros_entrega
  using (( SELECT rest_privado.tem_permissao(bairros_entrega.restaurante_id, ARRAY['restaurante'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(bairros_entrega.restaurante_id, ARRAY['restaurante'::text]) AS tem_permissao));

alter policy "caixa e dono abrem o caixa" on public.caixa_sessoes
  with check (( SELECT rest_privado.tem_permissao(caixa_sessoes.restaurante_id, ARRAY['caixa_operar'::text]) AS tem_permissao));

alter policy "caixa e dono fecham o caixa" on public.caixa_sessoes
  using (( SELECT rest_privado.tem_permissao(caixa_sessoes.restaurante_id, ARRAY['caixa_operar'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(caixa_sessoes.restaurante_id, ARRAY['caixa_operar'::text]) AS tem_permissao));

alter policy "dono apaga categorias" on public.categorias
  using (( SELECT rest_privado.tem_permissao(categorias.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono cria categorias" on public.categorias
  with check (( SELECT rest_privado.tem_permissao(categorias.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono edita categorias" on public.categorias
  using (( SELECT rest_privado.tem_permissao(categorias.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(categorias.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "chamados_garcom_criar" on public.chamados_garcom
  with check (( SELECT rest_privado.tem_permissao(chamados_garcom.restaurante_id, ARRAY['caixa_operar'::text, 'delivery'::text, 'comandas_painel'::text]) AS tem_permissao));

alter policy "chamados_garcom_ler" on public.chamados_garcom
  using ((( SELECT rest_privado.tem_permissao(chamados_garcom.restaurante_id, ARRAY['caixa_operar'::text, 'delivery'::text, 'comandas_painel'::text]) AS tem_permissao) OR (garcom_id IN ( SELECT m.id
   FROM membros m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.ativo)))));

alter policy "cliente lê o próprio cadastro e dono/caixa leem os do restaur" on public.clientes
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT rest_privado.tem_permissao(clientes.restaurante_id, ARRAY['delivery'::text]) AS tem_permissao)));

alter policy "cupons_dono_altera" on public.cupons
  using (( SELECT rest_privado.tem_permissao(cupons.restaurante_id, ARRAY['cupons'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(cupons.restaurante_id, ARRAY['cupons'::text]) AS tem_permissao));

alter policy "cupons_dono_cria" on public.cupons
  with check (( SELECT rest_privado.tem_permissao(cupons.restaurante_id, ARRAY['cupons'::text]) AS tem_permissao));

alter policy "cupons_dono_le" on public.cupons
  using (( SELECT rest_privado.tem_permissao(cupons.restaurante_id, ARRAY['delivery'::text, 'cupons'::text]) AS tem_permissao));

alter policy "entregadores_alterar" on public.entregadores
  using (( SELECT rest_privado.tem_permissao(entregadores.restaurante_id, ARRAY['entregadores'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(entregadores.restaurante_id, ARRAY['entregadores'::text]) AS tem_permissao));

alter policy "entregadores_criar" on public.entregadores
  with check (( SELECT rest_privado.tem_permissao(entregadores.restaurante_id, ARRAY['entregadores'::text]) AS tem_permissao));

alter policy "entregadores_ler" on public.entregadores
  using (( SELECT rest_privado.tem_permissao(entregadores.restaurante_id, ARRAY['delivery'::text, 'entregadores'::text]) AS tem_permissao));

alter policy "dono apaga pracas" on public.estacoes
  using (( SELECT rest_privado.tem_permissao(estacoes.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono cria pracas" on public.estacoes
  with check (( SELECT rest_privado.tem_permissao(estacoes.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono edita pracas" on public.estacoes
  using (( SELECT rest_privado.tem_permissao(estacoes.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(estacoes.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono e caixa veem a fila" on public.fila_impressao
  using (( SELECT rest_privado.tem_permissao(fila_impressao.restaurante_id, ARRAY['caixa_operar'::text, 'impressao'::text]) AS tem_permissao));

alter policy "dono apaga grupos" on public.grupos_adicionais
  using (( SELECT rest_privado.tem_permissao(grupos_adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono cria grupos" on public.grupos_adicionais
  with check (( SELECT rest_privado.tem_permissao(grupos_adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono edita grupos" on public.grupos_adicionais
  using (( SELECT rest_privado.tem_permissao(grupos_adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(grupos_adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono apaga impressoras" on public.impressoras
  using (( SELECT rest_privado.tem_permissao(impressoras.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono cria impressoras" on public.impressoras
  with check (( SELECT rest_privado.tem_permissao(impressoras.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono e caixa veem impressoras" on public.impressoras
  using (( SELECT rest_privado.tem_permissao(impressoras.restaurante_id, ARRAY['caixa_operar'::text, 'impressao'::text]) AS tem_permissao));

alter policy "dono edita impressoras" on public.impressoras
  using (( SELECT rest_privado.tem_permissao(impressoras.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(impressoras.restaurante_id, ARRAY['impressao'::text]) AS tem_permissao));

alter policy "dono apaga mesas" on public.mesas
  using (( SELECT rest_privado.tem_permissao(mesas.restaurante_id, ARRAY['mesas'::text]) AS tem_permissao));

alter policy "dono cria mesas" on public.mesas
  with check (( SELECT rest_privado.tem_permissao(mesas.restaurante_id, ARRAY['mesas'::text]) AS tem_permissao));

alter policy "dono edita mesas" on public.mesas
  using (( SELECT rest_privado.tem_permissao(mesas.restaurante_id, ARRAY['mesas'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(mesas.restaurante_id, ARRAY['mesas'::text]) AS tem_permissao));

alter policy "caixa e dono registram movimentos" on public.movimentos_caixa
  with check (( SELECT rest_privado.tem_permissao(movimentos_caixa.restaurante_id, ARRAY['caixa_operar'::text]) AS tem_permissao));

alter policy "caixa e dono estornam pagamentos" on public.pagamentos
  using (( SELECT rest_privado.tem_permissao(pagamentos.restaurante_id, ARRAY['caixa_estornar'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(pagamentos.restaurante_id, ARRAY['caixa_estornar'::text]) AS tem_permissao));

alter policy "pedidos_alteracoes_ler" on public.pedidos_alteracoes
  using (( SELECT rest_privado.tem_permissao(pedidos_alteracoes.restaurante_id, ARRAY['delivery'::text]) AS tem_permissao));

alter policy "dono apaga etapas" on public.produto_etapas
  using (( SELECT rest_privado.tem_permissao(produto_etapas.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono cria etapas" on public.produto_etapas
  with check (( SELECT rest_privado.tem_permissao(produto_etapas.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono edita etapas" on public.produto_etapas
  using (( SELECT rest_privado.tem_permissao(produto_etapas.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(produto_etapas.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono apaga produtos" on public.produtos
  using (( SELECT rest_privado.tem_permissao(produtos.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono cria produtos" on public.produtos
  with check (( SELECT rest_privado.tem_permissao(produtos.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono edita produtos" on public.produtos
  using (( SELECT rest_privado.tem_permissao(produtos.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(produtos.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono desliga grupos de produtos" on public.produtos_grupos_adicionais
  using (( SELECT rest_privado.tem_permissao(produtos_grupos_adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono liga grupos a produtos" on public.produtos_grupos_adicionais
  with check (( SELECT rest_privado.tem_permissao(produtos_grupos_adicionais.restaurante_id, ARRAY['cardapio'::text]) AS tem_permissao));

alter policy "dono edita o restaurante" on public.restaurantes
  using (( SELECT rest_privado.tem_permissao(restaurantes.id, ARRAY['restaurante'::text]) AS tem_permissao))
  with check (( SELECT rest_privado.tem_permissao(restaurantes.id, ARRAY['restaurante'::text]) AS tem_permissao));

alter policy "rest: dono apaga imagens do restaurante" on storage.objects
  using (((bucket_id = ANY (ARRAY['rest-logos'::text, 'rest-produtos'::text])) AND ( SELECT rest_privado.tem_permissao(rest_privado.texto_para_uuid((storage.foldername(objects.name))[1]), ARRAY['cardapio'::text, 'restaurante'::text]) AS tem_permissao)));

alter policy "rest: dono envia imagens do restaurante" on storage.objects
  with check (((bucket_id = ANY (ARRAY['rest-logos'::text, 'rest-produtos'::text])) AND ( SELECT rest_privado.tem_permissao(rest_privado.texto_para_uuid((storage.foldername(objects.name))[1]), ARRAY['cardapio'::text, 'restaurante'::text]) AS tem_permissao)));

alter policy "rest: dono le imagens do restaurante" on storage.objects
  using (((bucket_id = ANY (ARRAY['rest-logos'::text, 'rest-produtos'::text])) AND ( SELECT rest_privado.tem_permissao(rest_privado.texto_para_uuid((storage.foldername(objects.name))[1]), ARRAY['cardapio'::text, 'restaurante'::text]) AS tem_permissao)));

alter policy "rest: dono substitui imagens do restaurante" on storage.objects
  using (((bucket_id = ANY (ARRAY['rest-logos'::text, 'rest-produtos'::text])) AND ( SELECT rest_privado.tem_permissao(rest_privado.texto_para_uuid((storage.foldername(objects.name))[1]), ARRAY['cardapio'::text, 'restaurante'::text]) AS tem_permissao)))
  with check (((bucket_id = ANY (ARRAY['rest-logos'::text, 'rest-produtos'::text])) AND ( SELECT rest_privado.tem_permissao(rest_privado.texto_para_uuid((storage.foldername(objects.name))[1]), ARRAY['cardapio'::text, 'restaurante'::text]) AS tem_permissao))
);
