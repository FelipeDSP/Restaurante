-- Conta opcional do cliente do delivery: entra com o telefone + código (OTP do Supabase Auth,
-- enviado pelo gancho "Send SMS" em /api/auth/enviar-codigo). Pedir sem conta continua igual.
--
-- Um usuário do Auth (o telefone) pode ser cliente de vários restaurantes: cada restaurante tem
-- o seu registro em `clientes`, com nome próprio. Endereços e pedidos ficam por restaurante.
--
-- Exceção ao "nada é apagado": dados pessoais do cliente (LGPD). Excluir a conta apaga o
-- cliente e os endereços; os pedidos continuam (com o retrato de nome/telefone/endereço do
-- momento, como sempre) e só perdem o vínculo (`cliente_id` vira null).

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 120),
  -- Telefone confirmado pelo código (só dígitos, com o 55), copiado do Auth na criação.
  telefone text not null check (telefone ~ '^[0-9]{10,15}$'),
  criado_em timestamptz not null default now(),
  unique (restaurante_id, user_id),
  unique (restaurante_id, id)
);
create index clientes_restaurante_telefone_idx on public.clientes (restaurante_id, telefone);
-- A RLS procura pelo usuário logado.
create index clientes_user_idx on public.clientes (user_id);

alter table public.clientes enable row level security;

create policy "cliente lê o próprio cadastro e dono/caixa leem os do restaurante" on public.clientes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
create policy "cliente muda o próprio nome" on public.clientes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "cliente exclui a própria conta" on public.clientes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Criação só pela RPC `entrar_como_cliente` (exige telefone confirmado).
revoke all on public.clientes from anon;
revoke insert, update, truncate, references, trigger on public.clientes from authenticated;
grant update (nome) on public.clientes to authenticated;

-- Endereços usados nos pedidos do cliente (guardados pelo banco a cada pedido; até 5).
create table public.clientes_enderecos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  cliente_id uuid not null,
  bairro_id uuid not null references public.bairros_entrega (id),
  rua text not null,
  numero text not null,
  complemento text,
  referencia text,
  usado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  foreign key (restaurante_id, cliente_id) references public.clientes (restaurante_id, id) on delete cascade
);
create unique index clientes_enderecos_unico_idx on public.clientes_enderecos
  (restaurante_id, cliente_id, bairro_id, lower(rua), lower(numero), lower(coalesce(complemento, '')));
create index clientes_enderecos_restaurante_cliente_idx on public.clientes_enderecos (restaurante_id, cliente_id, usado_em desc);
create index clientes_enderecos_restaurante_bairro_idx on public.clientes_enderecos (restaurante_id, bairro_id);

alter table public.clientes_enderecos enable row level security;

create policy "cliente lê os próprios endereços" on public.clientes_enderecos
  for select to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = (select auth.uid())));
create policy "cliente apaga os próprios endereços" on public.clientes_enderecos
  for delete to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = (select auth.uid())));

revoke all on public.clientes_enderecos from anon;
revoke insert, update, truncate, references, trigger on public.clientes_enderecos from authenticated;

-- Pedido de delivery feito com a conta: o vínculo vem só do banco (sessão de quem pediu).
alter table public.pedidos add column cliente_id uuid;
alter table public.pedidos add foreign key (restaurante_id, cliente_id)
  references public.clientes (restaurante_id, id) on delete set null (cliente_id);
create index pedidos_restaurante_cliente_idx on public.pedidos (restaurante_id, cliente_id, criado_em desc)
  where cliente_id is not null;

create function rest_privado.pedidos_cliente()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.cliente_id := case
      when new.origem = 'delivery' and (select auth.uid()) is not null then
        (select c.id from public.clientes c
          where c.restaurante_id = new.restaurante_id and c.user_id = (select auth.uid()))
    end;
  elsif new.cliente_id is distinct from old.cliente_id and new.cliente_id is not null then
    -- Ninguém troca o dono do pedido; só a exclusão da conta solta o vínculo (vira null).
    new.cliente_id := old.cliente_id;
  end if;
  return new;
end;
$$;

create trigger t11_cliente before insert or update on public.pedidos
  for each row execute function rest_privado.pedidos_cliente();

-- Guarda o endereço do pedido na conta (o mais usado sobe; ficam os 5 mais recentes).
create function rest_privado.pedidos_guardar_endereco()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.cliente_id is null or new.bairro_id is null or new.endereco is null then
    return null;
  end if;

  insert into public.clientes_enderecos as e (restaurante_id, cliente_id, bairro_id, rua, numero, complemento, referencia)
  values (
    new.restaurante_id,
    new.cliente_id,
    new.bairro_id,
    btrim(new.endereco ->> 'rua'),
    btrim(new.endereco ->> 'numero'),
    nullif(btrim(new.endereco ->> 'complemento'), ''),
    nullif(btrim(new.endereco ->> 'referencia'), '')
  )
  on conflict (restaurante_id, cliente_id, bairro_id, lower(rua), lower(numero), lower(coalesce(complemento, '')))
  do update set usado_em = now(), referencia = excluded.referencia;

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

create trigger t40_guardar_endereco after insert on public.pedidos
  for each row execute function rest_privado.pedidos_guardar_endereco();

revoke all on function rest_privado.pedidos_cliente() from public, anon, authenticated;
revoke all on function rest_privado.pedidos_guardar_endereco() from public, anon, authenticated;

-- Depois de confirmar o código: cria (ou atualiza o nome do) cliente no restaurante.
create function public.entrar_como_cliente(p_restaurante_id uuid, p_nome text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_telefone text;
  v_id uuid;
begin
  select u.phone into v_telefone
  from auth.users u
  where u.id = v_uid and u.phone_confirmed_at is not null and u.phone is not null and u.phone <> '';
  if v_telefone is null then
    raise exception 'Confirme o seu telefone para continuar.' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_nome, ''))) not between 2 and 120 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.restaurantes r where r.id = p_restaurante_id and r.ativo and r.excluido_em is null
  ) then
    raise exception 'Restaurante não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.clientes as c (restaurante_id, user_id, nome, telefone)
  values (p_restaurante_id, v_uid, btrim(p_nome), regexp_replace(v_telefone, '\D', '', 'g'))
  on conflict (restaurante_id, user_id) do update set nome = excluded.nome
  returning c.id into v_id;
  return v_id;
end;
$$;

revoke all on function public.entrar_como_cliente(uuid, text) from public, anon;
grant execute on function public.entrar_como_cliente(uuid, text) to authenticated;

-- Pedidos da conta no restaurante (os mesmos campos públicos do acompanhamento).
create function public.meus_pedidos_cliente(p_restaurante_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', p.id, 'numero', p.numero, 'status', p.status, 'total', p.total, 'criado_em', p.criado_em)
    order by p.criado_em desc
  ), '[]'::jsonb)
  from (
    select p.*
    from public.pedidos p
    join public.clientes c on c.restaurante_id = p.restaurante_id and c.id = p.cliente_id
    where p.restaurante_id = p_restaurante_id
      and c.user_id = (select auth.uid())
    order by p.criado_em desc
    limit 30
  ) p;
$$;

revoke all on function public.meus_pedidos_cliente(uuid) from public, anon;
grant execute on function public.meus_pedidos_cliente(uuid) to authenticated;

-- Conta de cliente (só telefone, sem e-mail) não cria restaurante: o cadastro da plataforma é por e-mail.
create or replace function public.criar_meu_restaurante(
  p_nome text,
  p_slug text,
  p_nome_dono text,
  p_fuso text,
  p_whatsapp text default null,
  p_cor_primaria text default '#111827',
  p_cor_secundaria text default '#f59e0b'
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'Entre com a sua conta para cadastrar o restaurante.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users u where u.id = v_uid and coalesce(u.email, '') <> '') then
    raise exception 'Crie a conta do restaurante com um e-mail.' using errcode = 'P0001';
  end if;

  -- Limite simples contra abuso do teste grátis.
  if (select count(*) from public.membros where user_id = v_uid and papel = 'dono') >= 3 then
    raise exception 'Limite de restaurantes por conta atingido. Fale com o suporte.' using errcode = 'P0001';
  end if;

  if length(btrim(coalesce(p_nome_dono, ''))) not between 1 and 80 then
    raise exception 'Informe o seu nome.' using errcode = 'P0001';
  end if;

  if rest_privado.slug_reservado(p_slug) then
    raise exception 'Esse endereço é reservado. Escolha outro.' using errcode = 'P0001';
  end if;

  begin
    insert into public.restaurantes (slug, nome, fuso_horario, whatsapp, cor_primaria, cor_secundaria, aceita_delivery)
    values (p_slug, btrim(p_nome), p_fuso, nullif(btrim(p_whatsapp), ''), p_cor_primaria, p_cor_secundaria, false)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esse endereço já está em uso. Escolha outro.' using errcode = 'P0001';
  end;

  insert into public.membros (restaurante_id, user_id, nome, papel)
  values (v_id, v_uid, btrim(p_nome_dono), 'dono');

  return v_id;
end;
$$;
