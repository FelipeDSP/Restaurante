-- Bloqueio de tentativas de login (pedido do cliente em 30/10): senha errada seguida na mesma conta
-- ou do mesmo IP bloqueia por um tempo que cresce. Fica no banco (não zera quando o app reinicia).
-- Só o servidor do app usa (chave secreta); o navegador não lê nem grava.
--   conta:<e-mail>   5 erros -> 15 min, 10 -> 1 h, 20 -> 24 h
--   ip:<endereço>    30 erros -> 15 min, 100 -> 1 h
-- Um acerto zera a conta. 1 h sem erro (depois do fim do bloqueio) recomeça a contagem.

create table rest_privado.tentativas_login (
  chave text primary key check (length(chave) <= 300),
  falhas integer not null default 0,
  ultima_falha_em timestamptz not null default now(),
  bloqueado_ate timestamptz
);
alter table rest_privado.tentativas_login enable row level security;
revoke all on rest_privado.tentativas_login from public, anon, authenticated;

-- Segundos que ainda faltam de bloqueio (0 = pode tentar).
create or replace function public.login_espera(p_chaves text[])
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(ceil(extract(epoch from t.bloqueado_ate - now())))::integer, 0)
  from rest_privado.tentativas_login t
  where t.chave = any (p_chaves) and t.bloqueado_ate > now();
$$;

-- Registra o resultado da tentativa e devolve o bloqueio que passou a valer (segundos).
create or replace function public.login_resultado(p_chaves text[], p_ok boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
  v_falhas integer;
begin
  -- Limpeza barata: o que já não bloqueia e está parado há 2 dias.
  delete from rest_privado.tentativas_login
  where ultima_falha_em < now() - interval '2 days' and (bloqueado_ate is null or bloqueado_ate < now());

  if p_ok then
    delete from rest_privado.tentativas_login where chave = any (p_chaves) and chave like 'conta:%';
    return 0;
  end if;

  foreach v_chave in array p_chaves loop
    insert into rest_privado.tentativas_login as t (chave, falhas, ultima_falha_em)
    values (v_chave, 1, now())
    on conflict (chave) do update
      -- Recomeça só depois de 1 h sem erro contada do fim do último bloqueio (senão o bloqueio não cresce).
      set falhas = case when greatest(t.ultima_falha_em, coalesce(t.bloqueado_ate, t.ultima_falha_em)) < now() - interval '1 hour'
                        then 1 else t.falhas + 1 end,
          ultima_falha_em = now()
    returning falhas into v_falhas;

    update rest_privado.tentativas_login
    set bloqueado_ate = now() + case
      when v_chave like 'conta:%' and v_falhas >= 20 then interval '24 hours'
      when v_chave like 'conta:%' and v_falhas >= 10 then interval '1 hour'
      when v_chave like 'conta:%' and v_falhas >= 5 then interval '15 minutes'
      when v_chave like 'ip:%' and v_falhas >= 100 then interval '1 hour'
      when v_chave like 'ip:%' and v_falhas >= 30 then interval '15 minutes'
    end
    where chave = v_chave
      and ((v_chave like 'conta:%' and v_falhas in (5, 10, 20)) or (v_chave like 'ip:%' and v_falhas in (30, 100)));
  end loop;

  return public.login_espera(p_chaves);
end;
$$;

revoke all on function public.login_espera(text[]) from public, anon, authenticated;
revoke all on function public.login_resultado(text[], boolean) from public, anon, authenticated;
grant execute on function public.login_espera(text[]) to service_role;
grant execute on function public.login_resultado(text[], boolean) to service_role;
