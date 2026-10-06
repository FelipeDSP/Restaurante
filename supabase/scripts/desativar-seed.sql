-- Desativa os dados de DESENVOLVIMENTO (seed) num banco que vai para produção.
-- Rodar no SQL Editor do Supabase (como postgres) ANTES de abrir o sistema ao público.
--
-- O seed tem 3 restaurantes de exemplo e usuários @exemplo.com com a senha pública "senha123".
-- Nada é apagado (regra do projeto): os restaurantes saem do ar e as contas ficam bloqueadas.

begin;

-- Restaurantes de exemplo fora do ar (site público, cardápio e acesso da equipe).
update public.restaurantes
set ativo = false, excluido_em = coalesce(excluido_em, now())
where slug in ('brasa-espetinhos', 'burger-do-ze', 'espeto-da-praca');

-- Contas de exemplo bloqueadas no login.
update auth.users
set banned_until = '2999-12-31'  -- o Auth (Go) não aceita 'infinity'
where email like '%@exemplo.com';

-- Encerra sessões abertas dessas contas.
delete from auth.sessions
where user_id in (select id from auth.users where email like '%@exemplo.com');

-- Conferência
select slug, ativo, excluido_em from public.restaurantes
where slug in ('brasa-espetinhos', 'burger-do-ze', 'espeto-da-praca');
select email, banned_until from auth.users where email like '%@exemplo.com' order by email;

commit;
