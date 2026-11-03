-- Teste grátis acabou: suspende na hora, sem os 5 dias de tolerância (decisão do cliente em 03/11:
-- "já são grátis"). Fatura atrasada ou assinatura cancelada continuam com 5 dias.
create or replace function rest_privado.restaurante_suspenso(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case a.status
      when 'teste' then coalesce(a.periodo_termina_em, a.teste_termina_em) < now()
      when 'atrasada' then coalesce(a.periodo_termina_em, a.teste_termina_em) + interval '5 days' < now()
      when 'cancelada' then coalesce(a.periodo_termina_em, a.teste_termina_em) + interval '5 days' < now()
      else false
    end
    from public.assinaturas a
    where a.restaurante_id = p_restaurante_id
  ), false);
$$;
revoke all on function rest_privado.restaurante_suspenso(uuid) from public, anon, authenticated;
