-- Seed de desenvolvimento: 3 restaurantes para detectar vazamento entre tenants.
-- Todos os usuários têm a senha: senha123
--
-- Restaurantes (slug):         usuários (e-mail):
--   brasa-espetinhos (A)       dono.brasa, caixa.brasa, garcom1.brasa, garcom2.brasa @exemplo.com
--   burger-do-ze     (B)       dono.burger, caixa.burger, garcom1.burger, garcom2.burger @exemplo.com
--   espeto-da-praca  (C)       dono.praca, caixa.praca, garcom1.praca, garcom2.praca @exemplo.com
--   multi@exemplo.com: garçom no A e caixa no B (testa o seletor de restaurante)
--
-- IDs determinísticos (md5 do e-mail/slug) para o seed poder ser reexecutado.

create function pg_temp.criar_usuario(p_email text, p_senha text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := md5(p_email)::uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', ''
  )
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    v_id, v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
    now(), now(), now()
  )
  on conflict do nothing;

  return v_id;
end;
$$;

-- Aberto todos os dias, o dia inteiro (facilita testar o delivery).
create function pg_temp.horario_integral()
returns jsonb
language sql
as $$
  select jsonb_object_agg(dia, '[{"abre": "00:00", "fecha": "00:00"}]'::jsonb)
  from unnest(array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']) as dia;
$$;

-- ---------------------------------------------------------------------------
-- Restaurantes
-- ---------------------------------------------------------------------------

insert into public.restaurantes (
  id, slug, nome, cor_primaria, cor_secundaria, telefone, whatsapp, endereco,
  fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min
) values
  (md5('brasa-espetinhos')::uuid, 'brasa-espetinhos', 'Brasa Espetinhos & Burger', '#b91c1c', '#f59e0b',
   '(69) 3222-0001', '5569999990001', '{"rua": "Av. Sete de Setembro", "numero": "100", "cidade": "Porto Velho", "uf": "RO"}',
   'America/Porto_Velho', pg_temp.horario_integral(), true, 2000, 45),
  (md5('burger-do-ze')::uuid, 'burger-do-ze', 'Burger do Zé', '#1d4ed8', '#facc15',
   '(11) 3000-0002', '5511999990002', '{"rua": "Rua Augusta", "numero": "200", "cidade": "São Paulo", "uf": "SP"}',
   'America/Sao_Paulo', pg_temp.horario_integral(), true, 0, 30),
  (md5('espeto-da-praca')::uuid, 'espeto-da-praca', 'Espeto da Praça', '#15803d', '#f97316',
   '(65) 3000-0003', '5565999990003', '{"rua": "Praça Alencastro", "numero": "3", "cidade": "Cuiabá", "uf": "MT"}',
   'America/Cuiaba', pg_temp.horario_integral(), false, 0, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Usuários e membros
-- ---------------------------------------------------------------------------

insert into public.membros (restaurante_id, user_id, nome, papel)
select md5(r.slug)::uuid, pg_temp.criar_usuario(u.prefixo || '.' || r.apelido || '@exemplo.com', 'senha123'),
       u.nome || ' (' || r.apelido || ')', u.papel
from (values
  ('brasa-espetinhos', 'brasa'),
  ('burger-do-ze', 'burger'),
  ('espeto-da-praca', 'praca')
) as r (slug, apelido)
cross join (values
  ('dono', 'Dono', 'dono'),
  ('caixa', 'Caixa', 'caixa'),
  ('garcom1', 'Garçom 1', 'garcom'),
  ('garcom2', 'Garçom 2', 'garcom'),
  ('cozinha', 'Cozinha', 'cozinha')
) as u (prefixo, nome, papel)
on conflict (restaurante_id, user_id) do nothing;

insert into public.membros (restaurante_id, user_id, nome, papel)
values
  (md5('brasa-espetinhos')::uuid, pg_temp.criar_usuario('multi@exemplo.com', 'senha123'), 'Multi (garçom)', 'garcom'),
  (md5('burger-do-ze')::uuid, md5('multi@exemplo.com')::uuid, 'Multi (caixa)', 'caixa')
on conflict (restaurante_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Cardápio (preços em centavos)
-- ---------------------------------------------------------------------------

insert into public.categorias (id, restaurante_id, nome, ordem)
select md5(slug || '/' || nome)::uuid, md5(slug)::uuid, nome, ordem
from (values
  ('brasa-espetinhos', 'Espetos', 1), ('brasa-espetinhos', 'Burgers', 2), ('brasa-espetinhos', 'Bebidas', 3),
  ('burger-do-ze', 'Burgers', 1), ('burger-do-ze', 'Acompanhamentos', 2), ('burger-do-ze', 'Bebidas', 3),
  ('espeto-da-praca', 'Espetos', 1), ('espeto-da-praca', 'Porções', 2), ('espeto-da-praca', 'Bebidas', 3)
) as c (slug, nome, ordem)
on conflict (id) do nothing;

insert into public.produtos (id, restaurante_id, categoria_id, nome, descricao, preco, ordem, disponivel_delivery)
select md5(slug || '/' || categoria || '/' || nome)::uuid, md5(slug)::uuid, md5(slug || '/' || categoria)::uuid,
       nome, descricao, preco, ordem, delivery
from (values
  ('brasa-espetinhos', 'Espetos', 'Espeto de carne', 'Alcatra temperada na brasa', 1200, 1, true),
  ('brasa-espetinhos', 'Espetos', 'Espeto de frango', 'Coxa e sobrecoxa', 1000, 2, true),
  ('brasa-espetinhos', 'Espetos', 'Espeto de queijo coalho', null, 900, 3, true),
  ('brasa-espetinhos', 'Burgers', 'Burger artesanal', 'Blend 180 g, queijo e salada', 3200, 1, true),
  ('brasa-espetinhos', 'Burgers', 'Burger bacon', 'Blend 180 g, cheddar e bacon', 3600, 2, true),
  ('brasa-espetinhos', 'Bebidas', 'Refrigerante lata', null, 600, 1, true),
  ('brasa-espetinhos', 'Bebidas', 'Cerveja long neck', 'Só no salão', 1000, 2, false),
  ('burger-do-ze', 'Burgers', 'Zé Clássico', 'Pão, carne 150 g e queijo', 2800, 1, true),
  ('burger-do-ze', 'Burgers', 'Zé Duplo', 'Duas carnes 150 g', 3800, 2, true),
  ('burger-do-ze', 'Acompanhamentos', 'Batata frita', 'Porção individual', 1500, 1, true),
  ('burger-do-ze', 'Acompanhamentos', 'Onion rings', null, 1800, 2, true),
  ('burger-do-ze', 'Bebidas', 'Milkshake', 'Chocolate ou morango', 2000, 1, true),
  ('burger-do-ze', 'Bebidas', 'Refrigerante lata', null, 600, 2, true),
  ('espeto-da-praca', 'Espetos', 'Espeto misto', 'Carne, frango e linguiça', 1400, 1, true),
  ('espeto-da-praca', 'Espetos', 'Espeto de linguiça', null, 900, 2, true),
  ('espeto-da-praca', 'Porções', 'Mandioca frita', null, 2500, 1, true),
  ('espeto-da-praca', 'Porções', 'Farofa da casa', null, 800, 2, true),
  ('espeto-da-praca', 'Bebidas', 'Suco natural', 'Laranja ou maracujá', 900, 1, true),
  ('espeto-da-praca', 'Bebidas', 'Água', null, 400, 2, true)
) as p (slug, categoria, nome, descricao, preco, ordem, delivery)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Praças de produção (bebidas ficam sem praça: não vão para a cozinha)
-- ---------------------------------------------------------------------------

insert into public.estacoes (id, restaurante_id, nome, ordem)
select md5(slug || '/praca/' || nome)::uuid, md5(slug)::uuid, nome, ordem
from (values
  ('brasa-espetinhos', 'Churrasqueira', 1), ('brasa-espetinhos', 'Chapa', 2),
  ('burger-do-ze', 'Chapa', 1), ('burger-do-ze', 'Fritadeira', 2)
) as e (slug, nome, ordem)
on conflict (id) do nothing;

-- Rota de preparo por produto (mesma ordem = ao mesmo tempo; ordem maior = depois).
insert into public.produto_etapas (restaurante_id, produto_id, estacao_id, ordem)
select p.restaurante_id, p.id, md5(x.slug || '/praca/' || x.praca)::uuid, 1
from (values
  ('brasa-espetinhos', 'Espetos', 'Churrasqueira'), ('brasa-espetinhos', 'Burgers', 'Chapa'),
  ('burger-do-ze', 'Burgers', 'Chapa'), ('burger-do-ze', 'Acompanhamentos', 'Fritadeira')
) as x (slug, categoria, praca)
join public.produtos p on p.categoria_id = md5(x.slug || '/' || x.categoria)::uuid
on conflict (restaurante_id, produto_id, estacao_id) do nothing;

-- Exemplo de sequência: o blend do Burger bacon vai primeiro para a brasa, depois a chapa monta.
insert into public.produto_etapas (restaurante_id, produto_id, estacao_id, ordem)
values (md5('brasa-espetinhos')::uuid, md5('brasa-espetinhos/Burgers/Burger bacon')::uuid,
        md5('brasa-espetinhos/praca/Churrasqueira')::uuid, 1)
on conflict (restaurante_id, produto_id, estacao_id) do nothing;
update public.produto_etapas set ordem = 2
where produto_id = md5('brasa-espetinhos/Burgers/Burger bacon')::uuid
  and estacao_id = md5('brasa-espetinhos/praca/Chapa')::uuid;

-- ---------------------------------------------------------------------------
-- Adicionais e opções (só em produtos que os testes não usam)
-- ---------------------------------------------------------------------------

insert into public.grupos_adicionais (id, restaurante_id, nome, minimo, maximo, ordem)
select md5(slug || '/grupo/' || nome)::uuid, md5(slug)::uuid, nome, minimo, maximo, ordem
from (values
  ('brasa-espetinhos', 'Ponto da carne', 1, 1, 1), ('brasa-espetinhos', 'Turbine seu burger', 0, 3, 2),
  ('burger-do-ze', 'Ponto da carne', 1, 1, 1), ('burger-do-ze', 'Adicionais', 0, 4, 2),
  ('burger-do-ze', 'Sabor', 1, 1, 3)
) as g (slug, nome, minimo, maximo, ordem)
on conflict (id) do nothing;

insert into public.adicionais (restaurante_id, grupo_id, nome, preco, ordem)
select md5(slug)::uuid, md5(slug || '/grupo/' || grupo)::uuid, nome, preco, ordem
from (values
  ('brasa-espetinhos', 'Ponto da carne', 'Mal passado', 0, 1),
  ('brasa-espetinhos', 'Ponto da carne', 'Ao ponto', 0, 2),
  ('brasa-espetinhos', 'Ponto da carne', 'Bem passado', 0, 3),
  ('brasa-espetinhos', 'Turbine seu burger', 'Bacon extra', 500, 1),
  ('brasa-espetinhos', 'Turbine seu burger', 'Cheddar extra', 400, 2),
  ('brasa-espetinhos', 'Turbine seu burger', 'Ovo', 300, 3),
  ('burger-do-ze', 'Ponto da carne', 'Ao ponto', 0, 1),
  ('burger-do-ze', 'Ponto da carne', 'Bem passado', 0, 2),
  ('burger-do-ze', 'Adicionais', 'Bacon', 400, 1),
  ('burger-do-ze', 'Adicionais', 'Cheddar', 300, 2),
  ('burger-do-ze', 'Adicionais', 'Cebola caramelizada', 300, 3),
  ('burger-do-ze', 'Adicionais', 'Carne extra', 1200, 4),
  ('burger-do-ze', 'Sabor', 'Chocolate', 0, 1),
  ('burger-do-ze', 'Sabor', 'Morango', 0, 2),
  ('burger-do-ze', 'Sabor', 'Ovomaltine', 300, 3)
) as a (slug, grupo, nome, preco, ordem)
where not exists (select 1 from public.adicionais x where x.grupo_id = md5(slug || '/grupo/' || grupo)::uuid and x.nome = a.nome);

insert into public.produtos_grupos_adicionais (restaurante_id, produto_id, grupo_id)
select md5(slug)::uuid, md5(slug || '/' || produto)::uuid, md5(slug || '/grupo/' || grupo)::uuid
from (values
  ('brasa-espetinhos', 'Burgers/Burger bacon', 'Ponto da carne'),
  ('brasa-espetinhos', 'Burgers/Burger bacon', 'Turbine seu burger'),
  ('burger-do-ze', 'Burgers/Zé Duplo', 'Ponto da carne'),
  ('burger-do-ze', 'Burgers/Zé Duplo', 'Adicionais'),
  ('burger-do-ze', 'Bebidas/Milkshake', 'Sabor')
) as l (slug, produto, grupo)
on conflict (restaurante_id, produto_id, grupo_id) do nothing;

-- ---------------------------------------------------------------------------
-- Mesas e bairros
-- ---------------------------------------------------------------------------

insert into public.mesas (restaurante_id, numero, ordem)
select md5(slug)::uuid, n::text, n
from unnest(array['brasa-espetinhos', 'burger-do-ze', 'espeto-da-praca']) as slug
cross join generate_series(1, 10) as n
on conflict (restaurante_id, numero) do nothing;

insert into public.mesas (restaurante_id, numero, ordem)
values (md5('brasa-espetinhos')::uuid, 'Varanda 1', 11), (md5('brasa-espetinhos')::uuid, 'Varanda 2', 12)
on conflict (restaurante_id, numero) do nothing;

insert into public.bairros_entrega (restaurante_id, nome, taxa)
select md5(slug)::uuid, nome, taxa
from (values
  ('brasa-espetinhos', 'Centro', 500), ('brasa-espetinhos', 'Olaria', 700), ('brasa-espetinhos', 'Embratel', 800),
  ('burger-do-ze', 'Consolação', 600), ('burger-do-ze', 'Bela Vista', 700), ('burger-do-ze', 'Jardins', 900),
  ('espeto-da-praca', 'Centro Norte', 500), ('espeto-da-praca', 'Centro Sul', 500), ('espeto-da-praca', 'Goiabeiras', 800)
) as b (slug, nome, taxa)
on conflict (restaurante_id, nome) do nothing;
