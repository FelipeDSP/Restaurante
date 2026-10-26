-- Chamar garçom: dono ou caixa chama um garçom pelo painel (com recado opcional); o app dele
-- vibra, bipa e mostra o recado até ele tocar em "Vou", e quem chamou vê que ele recebeu.

create table public.chamados_garcom (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id),
  garcom_id uuid not null,
  recado text check (recado is null or length(recado) between 1 and 120),
  -- Quem chamou e quando: só o banco define.
  chamado_por uuid,
  criado_em timestamptz not null default now(),
  atendido_em timestamptz,
  foreign key (restaurante_id, garcom_id) references public.membros (restaurante_id, id),
  foreign key (restaurante_id, chamado_por) references public.membros (restaurante_id, id)
);

create index chamados_garcom_restaurante on public.chamados_garcom (restaurante_id, garcom_id, criado_em desc);

alter table public.chamados_garcom enable row level security;
revoke all on public.chamados_garcom from anon, authenticated;
grant select on public.chamados_garcom to authenticated;
grant insert (restaurante_id, garcom_id, recado) on public.chamados_garcom to authenticated;
grant update (atendido_em) on public.chamados_garcom to authenticated;

-- Dono e caixa veem os chamados do restaurante; o garçom vê só os dele.
create policy chamados_garcom_ler on public.chamados_garcom
  for select to authenticated
  using (
    (select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa']))
    or garcom_id in (select m.id from public.membros m where m.user_id = (select auth.uid()) and m.ativo)
  );
create policy chamados_garcom_criar on public.chamados_garcom
  for insert to authenticated
  with check ((select rest_privado.tem_papel(restaurante_id, array['dono', 'caixa'])));
-- Só o próprio garçom marca que recebeu.
create policy chamados_garcom_atender on public.chamados_garcom
  for update to authenticated
  using (garcom_id in (select m.id from public.membros m where m.user_id = (select auth.uid()) and m.ativo))
  with check (garcom_id in (select m.id from public.membros m where m.user_id = (select auth.uid()) and m.ativo));

create or replace function rest_privado.chamados_garcom_regras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.recado := nullif(btrim(coalesce(new.recado, '')), '');
    new.chamado_por := rest_privado.membro_atual(new.restaurante_id);
    new.criado_em := now();
    new.atendido_em := null;
    if not exists (
      select 1 from public.membros m
      where m.id = new.garcom_id and m.restaurante_id = new.restaurante_id and m.ativo and m.papel = 'garcom'
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
$$;

create trigger t01_regras
before insert or update on public.chamados_garcom
for each row execute function rest_privado.chamados_garcom_regras();

alter publication supabase_realtime add table public.chamados_garcom;
