-- Entregue por item na mesa (pedido do cliente em 28/10: "pediu refri e hambúrguer mas quer o refri
-- agora"). O garçom marca cada item entregue; antes só dava para marcar o pedido inteiro, e só o que
-- passava pela cozinha. Quando todos os itens com preparo de um pedido foram entregues, os tickets
-- das praças ficam prontos e retirados (somem da cozinha, como o "Retirei").

alter table public.itens_pedido
  add column entregue_em timestamptz,
  add column entregue_por uuid,
  add foreign key (restaurante_id, entregue_por) references public.membros (restaurante_id, id);

create index itens_pedido_restaurante_entregue_por on public.itens_pedido (restaurante_id, entregue_por) where entregue_por is not null;

-- A equipe só diz "entregue" (qualquer valor) ou "não entregue" (null); hora e quem vêm do banco.
grant update (entregue_em) on public.itens_pedido to authenticated;

create or replace function rest_privado.itens_pedido_antes_atualizar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.cancelado_em is not null then
    raise exception 'Item já cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and status = 'cancelado') then
    raise exception 'Pedido cancelado.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pedidos where id = old.pedido_id and origem = 'delivery')
     and not rest_privado.edicao_autorizada(old.pedido_id) then
    raise exception 'Os itens do delivery só mudam pela edição do pedido.' using errcode = 'P0001';
  end if;

  -- Para trocar as opções, cancela o item e lança de novo. "Pra viagem" pode mudar.
  new.pedido_id := old.pedido_id;
  new.produto_id := old.produto_id;
  new.nome_produto := old.nome_produto;
  new.preco_unitario := old.preco_unitario;
  new.etapas := old.etapas;
  new.adicionais := old.adicionais;
  new.preco_adicionais := old.preco_adicionais;
  new.criado_em := old.criado_em;
  new.para_viagem := coalesce(new.para_viagem, old.para_viagem);

  -- Entregue na mesa: só com a comanda aberta; hora e quem marcou vêm do banco.
  if (new.entregue_em is null) <> (old.entregue_em is null) then
    if not exists (
      select 1 from public.pedidos p join public.comandas c on c.id = p.comanda_id
      where p.id = old.pedido_id and c.status in ('aberta', 'conta_pedida')
    ) then
      raise exception 'Comanda não está aberta.' using errcode = 'P0001';
    end if;
    if new.entregue_em is not null then
      new.entregue_em := now();
      new.entregue_por := rest_privado.membro_atual(new.restaurante_id);
    else
      new.entregue_por := null;
    end if;
  else
    new.entregue_em := old.entregue_em;
    new.entregue_por := old.entregue_por;
  end if;

  if new.cancelado_em is not null then
    if coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
    end if;
    new.cancelado_em := now();
    new.cancelado_por := rest_privado.membro_atual(new.restaurante_id);
  else
    new.cancelado_por := null;
    new.motivo_cancelamento := null;
  end if;

  new.total := (new.preco_unitario + new.preco_adicionais) * new.quantidade;
  return new;
end;
$$;

-- Todos os itens com preparo do pedido entregues: os tickets das praças ficam prontos e retirados.
create or replace function rest_privado.itens_pedido_entregues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entregue_em is not null and old.entregue_em is null
     and jsonb_array_length(new.etapas) > 0
     and not exists (
       select 1 from public.itens_pedido i
       where i.pedido_id = new.pedido_id and i.cancelado_em is null
         and jsonb_array_length(i.etapas) > 0 and i.entregue_em is null
     ) then
    update public.tarefas_producao
    set status = 'pronto', retirada = true
    where pedido_id = new.pedido_id and restaurante_id = new.restaurante_id
      and not (status = 'pronto' and retirada);
  end if;
  return null;
end;
$$;

create trigger t35_entregues
after update of entregue_em on public.itens_pedido
for each row execute function rest_privado.itens_pedido_entregues();
