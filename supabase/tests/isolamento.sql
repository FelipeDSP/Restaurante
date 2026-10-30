-- Testes de isolamento entre restaurantes (RLS) e das regras de negócio.
-- Requer o seed. Roda tudo numa transação e desfaz no final (não deixa dados).
--
--   docker exec -i supabase_db_Restaurante psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/isolamento.sql
--
-- Saída: uma linha por teste (ok = true/false) e o total de falhas no fim.

begin;

create temp table resultado (n serial, ok boolean, teste text) on commit drop;
grant all on resultado to public;
grant usage on sequence resultado_n_seq to public;

create function pg_temp.ok(p_ok boolean, p_teste text) returns void
language sql as $$ insert into resultado (ok, teste) values (coalesce(p_ok, false), p_teste) $$;

-- Atua como o usuário (role authenticated + JWT com sub).
create function pg_temp.entrar(p_email text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', md5(p_email)::uuid, 'role', 'authenticated', 'session_id', md5(p_email || ':sessao')::uuid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.anonimo() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function pg_temp.admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  b constant uuid := md5('burger-do-ze')::uuid;
  n integer;
  v_caixa_a uuid;
  v_caixa_b uuid;
  v_mesa_a uuid;
  v_mesa_b uuid;
  v_comanda_a uuid;
  v_comanda_b uuid;
  v_pedido_a uuid;
  v_item_a uuid;
  v_produto_a uuid := md5('brasa-espetinhos/Espetos/Espeto de carne')::uuid;  -- 1200
  v_produto_a2 uuid := md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid; -- 3200
  v_cerveja_a uuid := md5('brasa-espetinhos/Bebidas/Cerveja long neck')::uuid; -- não vai no delivery
  v_produto_b uuid := md5('burger-do-ze/Burgers/Zé Clássico')::uuid;
  v_bairro_a uuid;
  v_bairro_b uuid;
  v_novo uuid;
  v_multi constant uuid := md5('multi@exemplo.com')::uuid;
  v_json jsonb;
  v_burger_bacon constant uuid := md5('brasa-espetinhos/Burgers/Burger bacon')::uuid; -- 3600
  v_ponto uuid;
  v_bem_passado uuid;
  v_bacon uuid;
  v_cheddar uuid;
  v_ovo uuid;
  v_bacon_b uuid;
  v_item uuid;
  v_teste integer;
  v_chapa_a constant uuid := md5('brasa-espetinhos/praca/Chapa')::uuid;
  v_churrasqueira_a constant uuid := md5('brasa-espetinhos/praca/Churrasqueira')::uuid;
  v_tarefa uuid;
  v_status text;
  v_res text[];
  v_linha text;
  v_impressora uuid;
  v_agente uuid;
  v_comanda_imp uuid;
  v_fila uuid;
  n2 integer;
  v_num1 integer;
  v_num2 integer;
begin
  perform pg_temp.admin();
  select id into v_mesa_a from public.mesas where restaurante_id = a and numero = '1';
  select id into v_mesa_b from public.mesas where restaurante_id = b and numero = '1';
  select id into v_bairro_a from public.bairros_entrega where restaurante_id = a and nome = 'Centro';
  select id into v_bairro_b from public.bairros_entrega where restaurante_id = b and nome = 'Consolação';
  -- Produto indisponível em B (não pode aparecer para ninguém de fora).
  update public.produtos set disponivel = false where id = md5('burger-do-ze/Bebidas/Milkshake')::uuid;

  -- ======================================================================
  -- Caixa: só abre com caixa aberto; garçom não abre caixa
  -- ======================================================================
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    insert into public.comandas (restaurante_id, mesa_id) values (a, v_mesa_a);
    perform pg_temp.ok(false, 'bloqueia abrir comanda sem caixa aberto');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Caixa fechado%', 'bloqueia abrir comanda sem caixa aberto');
  end;
  begin
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 10000);
    perform pg_temp.ok(false, 'garçom não abre caixa');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'garçom não abre caixa');
  end;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  insert into public.caixa_sessoes (restaurante_id, valor_inicial, aberta_por)
  values (a, 10000, '00000000-0000-0000-0000-000000000000')
  returning id into v_caixa_a;
  select count(*) into n from public.caixa_sessoes
  where id = v_caixa_a and aberta_por = (select id from public.membros where user_id = md5('caixa.brasa@exemplo.com')::uuid);
  perform pg_temp.ok(n = 1, 'aberta_por vem do usuário logado, não do cliente');
  begin
    insert into public.caixa_sessoes (restaurante_id) values (a);
    perform pg_temp.ok(false, 'só uma sessão de caixa aberta por restaurante');
  exception when unique_violation then
    perform pg_temp.ok(true, 'só uma sessão de caixa aberta por restaurante');
  end;

  perform pg_temp.entrar('caixa.burger@exemplo.com');
  insert into public.caixa_sessoes (restaurante_id) values (b) returning id into v_caixa_b;

  -- ======================================================================
  -- Fluxo de mesa no restaurante A
  -- ======================================================================
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, pessoas) values (a, v_mesa_a, 2) returning id into v_comanda_a;
  perform pg_temp.ok(v_comanda_a is not null, 'garçom abre comanda');

  begin
    insert into public.comandas (restaurante_id, mesa_id) values (a, v_mesa_a);
    perform pg_temp.ok(false, 'uma comanda aberta por mesa');
  exception when unique_violation then
    perform pg_temp.ok(true, 'uma comanda aberta por mesa');
  end;

  insert into public.pedidos (restaurante_id, origem, comanda_id) values (a, 'mesa', v_comanda_a)
  returning id, numero into v_pedido_a, v_num1;
  -- Cliente tenta mandar preço e total falsos.
  insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, total)
  values (a, v_pedido_a, v_produto_a, 'X', 1, 3, 1) returning id into v_item_a;
  insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade)
  values (a, v_pedido_a, v_produto_a2, 'X', 1, 1);

  select preco_unitario into n from public.itens_pedido where id = v_item_a;
  perform pg_temp.ok(n = 1200, 'preço do item vem do cadastro (congelado)');
  select total into n from public.comandas where id = v_comanda_a;
  perform pg_temp.ok(n = 3 * 1200 + 3200, 'total da comanda calculado no banco (6800)');

  -- Mudar o preço do produto não altera item já lançado.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.produtos set preco = 9999 where id = v_produto_a;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  select preco_unitario into n from public.itens_pedido where id = v_item_a;
  perform pg_temp.ok(n = 1200, 'alterar preço do produto não muda item lançado');

  -- Tentar alterar total da comanda diretamente.
  update public.comandas set total = 1 where id = v_comanda_a;
  select total into n from public.comandas where id = v_comanda_a;
  perform pg_temp.ok(n = 6800, 'total enviado pelo cliente é ignorado');

  -- Cancelar item exige motivo e recalcula.
  begin
    update public.itens_pedido set cancelado_em = now() where id = v_item_a;
    perform pg_temp.ok(false, 'cancelar item exige motivo');
  exception when others then
    perform pg_temp.ok(true, 'cancelar item exige motivo');
  end;
  update public.itens_pedido set cancelado_em = now(), motivo_cancelamento = 'cliente desistiu' where id = v_item_a;
  select total into n from public.comandas where id = v_comanda_a;
  perform pg_temp.ok(n = 3200, 'cancelar item recalcula a comanda (3200)');
  select count(*) into n from public.itens_pedido where id = v_item_a and cancelado_por is not null;
  perform pg_temp.ok(n = 1, 'cancelado_por preenchido pelo banco');

  -- Delete não é permitido.
  begin
    delete from public.itens_pedido where id = v_item_a;
    perform pg_temp.ok(false, 'itens não são apagados');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'itens não são apagados');
  end;

  -- Pedir conta, pagar parcial, tentar fechar, pagar o resto, fechar.
  update public.comandas set status = 'conta_pedida' where id = v_comanda_a;
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda_a, 2000, 'pix');
  begin
    update public.comandas set status = 'fechada' where id = v_comanda_a;
    perform pg_temp.ok(false, 'comanda só fecha quitada');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Comanda não quitada%', 'comanda só fecha quitada');
  end;
  -- Nunca acima do que falta (dois aparelhos cobrando a mesma mesa).
  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda_a, 1300, 'pix');
    perform pg_temp.ok(false, 'pagamento acima do que falta é recusado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Valor maior que o que falta (R$ 12,00)%', 'pagamento acima do que falta é recusado');
  end;

  -- Estorno exige motivo e libera o valor de novo.
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  begin
    update public.pagamentos set estornado_em = now() where comanda_id = v_comanda_a;
    perform pg_temp.ok(false, 'estorno exige motivo');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Informe o motivo do estorno%', 'estorno exige motivo');
  end;
  update public.pagamentos set estornado_em = now(), motivo_estorno = 'cobrado na maquininha errada'
  where comanda_id = v_comanda_a;
  select count(*) into n from public.pagamentos
  where comanda_id = v_comanda_a and motivo_estorno = 'cobrado na maquininha errada' and estornado_por is not null;
  perform pg_temp.ok(n = 1, 'estorno guarda motivo e quem estornou');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda_a, 3200, 'pix');
  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda_a, 100, 'dinheiro');
    perform pg_temp.ok(false, 'conta quitada não recebe outro pagamento');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Esta conta já está paga%', 'conta quitada não recebe outro pagamento');
  end;
  update public.comandas set status = 'fechada' where id = v_comanda_a;
  select count(*) into n from public.comandas where id = v_comanda_a and status = 'fechada' and fechada_por is not null;
  perform pg_temp.ok(n = 1, 'comanda quitada fecha');

  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda_a, 100, 'pix');
    perform pg_temp.ok(false, 'não registra pagamento em comanda fechada');
  exception when others then
    perform pg_temp.ok(true, 'não registra pagamento em comanda fechada');
  end;

  -- Garçom não estorna; garçom não altera cardápio.
  update public.pagamentos set estornado_em = now() where comanda_id = v_comanda_a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'garçom não estorna pagamento');
  update public.produtos set preco = 1 where restaurante_id = a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'garçom não altera produtos');

  -- ======================================================================
  -- Isolamento: usuários de A contra dados de B
  -- ======================================================================
  perform pg_temp.entrar('garcom1.burger@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id) values (b, v_mesa_b) returning id into v_comanda_b;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  select count(*) into n from public.membros where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê membros de B');
  select count(*) into n from public.mesas where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê mesas de B');
  select count(*) into n from public.caixa_sessoes where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê sessões de caixa de B');
  select count(*) into n from public.comandas where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê comandas de B');
  select count(*) into n from public.pedidos where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê pedidos de B');
  select count(*) into n from public.itens_pedido where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê itens de B');
  select count(*) into n from public.pagamentos where restaurante_id = b;
  perform pg_temp.ok(n = 0, 'A não lê pagamentos de B');
  select count(*) into n from public.produtos where restaurante_id = b and not disponivel;
  perform pg_temp.ok(n = 0, 'A não lê produtos indisponíveis de B');

  update public.restaurantes set nome = 'invadido' where id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'A não altera o restaurante B');
  update public.produtos set preco = 1 where restaurante_id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'A não altera produtos de B');
  update public.comandas set pessoas = 99 where restaurante_id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'A não altera comandas de B');
  update public.membros set papel = 'dono' where restaurante_id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'A não altera membros de B');
  delete from public.mesas where restaurante_id = b;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'A não apaga mesas de B');

  begin
    insert into public.mesas (restaurante_id, numero) values (b, '999');
    perform pg_temp.ok(false, 'A não cria mesa em B');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'A não cria mesa em B');
  end;
  begin
    insert into public.membros (restaurante_id, user_id, nome, papel)
    values (b, md5('dono.brasa@exemplo.com')::uuid, 'intruso', 'dono');
    perform pg_temp.ok(false, 'A não se adiciona como membro de B');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'A não se adiciona como membro de B');
  end;
  begin
    insert into public.pedidos (restaurante_id, origem, comanda_id) values (b, 'mesa', v_comanda_b);
    perform pg_temp.ok(false, 'A não lança pedido em comanda de B');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'A não lança pedido em comanda de B');
  end;
  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (b, v_comanda_b, 100, 'pix');
    perform pg_temp.ok(false, 'A não registra pagamento em B');
  exception when others then
    -- Barrado pelo trigger (não é membro) antes mesmo da RLS.
    perform pg_temp.ok(sqlstate = '42501' or sqlerrm = 'Usuário não é membro do restaurante.',
                       'A não registra pagamento em B');
  end;
  -- Referência cruzada: comanda de B usando o restaurante A.
  begin
    insert into public.pedidos (restaurante_id, origem, comanda_id) values (a, 'mesa', v_comanda_b);
    perform pg_temp.ok(false, 'FK composta bloqueia comanda de outro restaurante');
  exception when others then
    perform pg_temp.ok(true, 'FK composta bloqueia comanda de outro restaurante');
  end;
  begin
    update public.restaurantes set slug = 'outro' where id = a;
    perform pg_temp.ok(false, 'dono não muda o slug pelo app');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'dono não muda o slug pelo app');
  end;

  begin
    perform public.lancar_itens_comanda(v_comanda_b, jsonb_build_array(jsonb_build_object('produto_id', v_produto_b, 'quantidade', 1)));
    perform pg_temp.ok(false, 'A não lança itens (RPC) em comanda de B');
  exception when others then
    perform pg_temp.ok(sqlerrm = 'Comanda não encontrada.', 'A não lança itens (RPC) em comanda de B');
  end;

  -- RPC do garçom é tudo ou nada: item inválido não deixa pedido vazio.
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id)
  select a, id from public.mesas where restaurante_id = a and numero = '2'
  returning id into v_comanda_a;
  select count(*) into n from public.pedidos where comanda_id = v_comanda_a;
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(
      jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1),
      jsonb_build_object('produto_id', v_produto_b, 'quantidade', 1)));
  exception when others then null;
  end;
  perform pg_temp.ok(n = (select count(*) from public.pedidos where comanda_id = v_comanda_a),
                     'lançamento com item inválido não cria pedido');
  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(
    jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 2, 'observacao', 'sem cebola')));
  perform pg_temp.ok((select total from public.comandas where id = v_comanda_a) = 2 * 3200,
                     'RPC do garçom lança itens com preço do cadastro');

  -- ======================================================================
  -- Cozinha: praças e tarefas
  -- ======================================================================
  select id into v_tarefa from public.tarefas_producao
  where pedido_id = (v_json ->> 'pedido_id')::uuid and estacao_id = v_chapa_a and status = 'pendente';
  perform pg_temp.ok(v_tarefa is not null, 'item com praça abre a tarefa da praça');
  perform pg_temp.ok((select etapas = jsonb_build_array(jsonb_build_object('estacao_id', v_chapa_a, 'ordem', 1)) and not para_viagem
                      from public.itens_pedido where pedido_id = (v_json ->> 'pedido_id')::uuid),
                     'item guarda a rota de preparo do produto (e come no salão por padrão)');
  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(
    jsonb_build_object('produto_id', md5('brasa-espetinhos/Bebidas/Refrigerante lata')::uuid, 'quantidade', 1)));
  select count(*) into n from public.tarefas_producao where pedido_id = (v_json ->> 'pedido_id')::uuid;
  perform pg_temp.ok(n = 0, 'item sem praça não vai para a cozinha');

  begin
    insert into public.tarefas_producao (restaurante_id, pedido_id, estacao_id)
    values (a, (v_json ->> 'pedido_id')::uuid, v_chapa_a);
    perform pg_temp.ok(false, 'equipe não cria tarefa direto');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'equipe não cria tarefa direto');
  end;

  perform pg_temp.entrar('cozinha.brasa@exemplo.com');
  update public.tarefas_producao set status = 'pronto' where id = v_tarefa;
  perform pg_temp.ok((select status = 'pronto' and pronto_em is not null
                        and pronto_por = (select id from public.membros where user_id = md5('cozinha.brasa@exemplo.com')::uuid)
                      from public.tarefas_producao where id = v_tarefa),
                     'cozinha marca pronto e o banco registra quem e quando');
  begin
    update public.tarefas_producao set estacao_id = v_churrasqueira_a where id = v_tarefa;
    perform pg_temp.ok(false, 'tarefa não muda de praça');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'tarefa não muda de praça');
  end;
  begin
    insert into public.estacoes (restaurante_id, nome) values (a, 'Da cozinha');
    perform pg_temp.ok(false, 'cozinha não cria praça');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'cozinha não cria praça');
  end;
  perform pg_temp.entrar('dono.burger@exemplo.com');
  select count(*) into n from public.tarefas_producao where restaurante_id = a;
  perform pg_temp.ok(n = 0, 'B não vê tarefas da cozinha de A');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  -- ======================================================================
  -- Adicionais e opções
  -- ======================================================================
  select id into v_ponto from public.adicionais where grupo_id = md5('brasa-espetinhos/grupo/Ponto da carne')::uuid and nome = 'Ao ponto';
  select id into v_bem_passado from public.adicionais where grupo_id = md5('brasa-espetinhos/grupo/Ponto da carne')::uuid and nome = 'Bem passado';
  select id into v_bacon from public.adicionais where grupo_id = md5('brasa-espetinhos/grupo/Turbine seu burger')::uuid and nome = 'Bacon extra';
  select id into v_cheddar from public.adicionais where grupo_id = md5('brasa-espetinhos/grupo/Turbine seu burger')::uuid and nome = 'Cheddar extra';
  select id into v_ovo from public.adicionais where grupo_id = md5('brasa-espetinhos/grupo/Turbine seu burger')::uuid and nome = 'Ovo';
  perform pg_temp.ok(v_ponto is not null and v_bacon is not null, 'garçom lê as opções do próprio restaurante');
  perform pg_temp.admin();
  select id into v_bacon_b from public.adicionais where restaurante_id = b and nome = 'Bacon';
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');

  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object('produto_id', v_burger_bacon, 'quantidade', 1)));
    perform pg_temp.ok(false, 'grupo obrigatório sem escolha é recusado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Escolha 1 opção em "Ponto da carne"%', 'grupo obrigatório sem escolha é recusado');
  end;
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
      'produto_id', v_burger_bacon, 'quantidade', 1, 'adicionais', jsonb_build_array(v_ponto, v_bem_passado))));
    perform pg_temp.ok(false, 'grupo acima do máximo é recusado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Escolha no máximo 1 opção%', 'grupo acima do máximo é recusado');
  end;
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
      'produto_id', v_burger_bacon, 'quantidade', 1, 'adicionais', jsonb_build_array(v_ponto, v_bacon_b))));
    perform pg_temp.ok(false, 'opção de outro restaurante é recusada');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Adicional não disponível para este produto%', 'opção de outro restaurante é recusada');
  end;
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto_a2, 'quantidade', 1, 'adicionais', jsonb_build_array(v_bacon))));
    perform pg_temp.ok(false, 'opção de grupo não ligado ao produto é recusada');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Adicional não disponível para este produto%', 'opção de grupo não ligado ao produto é recusada');
  end;

  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
    'produto_id', v_burger_bacon, 'quantidade', 2, 'adicionais', jsonb_build_array(v_ponto, v_bacon, v_cheddar))));
  select id into v_item from public.itens_pedido where pedido_id = (v_json ->> 'pedido_id')::uuid;
  perform pg_temp.ok((select total = (3600 + 500 + 400) * 2 and preco_adicionais = 900 and jsonb_array_length(adicionais) = 3
                      from public.itens_pedido where id = v_item),
                     'item com opções: total = (produto + opções) x quantidade');
  perform pg_temp.ok((select adicionais -> 0 ->> 'nome' = 'Ao ponto' and adicionais -> 0 ->> 'grupo' = 'Ponto da carne'
                      from public.itens_pedido where id = v_item),
                     'item guarda o retrato das opções (grupo e nome)');

  -- Preço da opção vem do cadastro, não do cliente.
  insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade, adicionais)
  values (a, (v_json ->> 'pedido_id')::uuid, v_burger_bacon, 'x', 1, 1,
          jsonb_build_array(jsonb_build_object('id', v_ponto), jsonb_build_object('id', v_bacon, 'preco', 1)));
  perform pg_temp.ok((select preco_adicionais = 500 and total = 4100 from public.itens_pedido
                      where pedido_id = (v_json ->> 'pedido_id')::uuid and id <> v_item),
                     'preço da opção vem do cadastro');

  update public.itens_pedido set adicionais = '[]'::jsonb, preco_adicionais = 0, quantidade = 1 where id = v_item;
  perform pg_temp.ok((select preco_adicionais = 900 and jsonb_array_length(adicionais) = 3 and total = 4500
                      from public.itens_pedido where id = v_item),
                     'opções do item não mudam depois de lançado (só a quantidade)');

  -- Mesma opção mais de uma vez: só em grupo que permite repetir; o máximo conta unidades.
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
      'produto_id', v_burger_bacon, 'quantidade', 1, 'adicionais', jsonb_build_array(v_ponto, v_bacon, v_bacon))));
    perform pg_temp.ok(false, 'opção repetida recusada em grupo que não permite');
  exception when others then
    perform pg_temp.ok(sqlerrm like '%cada opção só pode ser escolhida uma vez%', 'opção repetida recusada em grupo que não permite');
  end;
  perform pg_temp.admin();
  update public.grupos_adicionais set repetir = true where id = md5('brasa-espetinhos/grupo/Turbine seu burger')::uuid;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
    'produto_id', v_burger_bacon, 'quantidade', 1, 'adicionais', jsonb_build_array(v_ponto, v_bacon, v_bacon))));
  perform pg_temp.ok((select preco_adicionais = 1000 and jsonb_array_length(adicionais) = 3 and total = 3600 + 1000
                      from public.itens_pedido where pedido_id = (v_json ->> 'pedido_id')::uuid),
                     'grupo que permite repetir: 2x bacon soma duas vezes');
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
      'produto_id', v_burger_bacon, 'quantidade', 1, 'adicionais', jsonb_build_array(v_ponto, v_bacon, v_bacon, v_bacon, v_bacon))));
    perform pg_temp.ok(false, 'repetição respeita o máximo do grupo');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Escolha no máximo%', 'repetição respeita o máximo do grupo');
  end;
  perform pg_temp.admin();
  update public.grupos_adicionais set repetir = false where id = md5('brasa-espetinhos/grupo/Turbine seu burger')::uuid;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  perform pg_temp.ok((select etapas = jsonb_build_array(jsonb_build_object('estacao_id', v_churrasqueira_a, 'ordem', 1),
                                                         jsonb_build_object('estacao_id', v_chapa_a, 'ordem', 2))
                      from public.itens_pedido where id = v_item),
                     'item em sequência guarda as etapas na ordem (brasa, depois chapa)');
  select count(*) into n from public.tarefas_producao where pedido_id = (select pedido_id from public.itens_pedido where id = v_item);
  perform pg_temp.ok(n = 2, 'item em sequência abre um ticket em cada praça');

  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(
    jsonb_build_object('produto_id', v_produto_a, 'quantidade', 2, 'para_viagem', true)));
  perform pg_temp.ok((select para_viagem from public.itens_pedido where pedido_id = (v_json ->> 'pedido_id')::uuid),
                     'garçom marca item pra viagem');
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.produtos set para_viagem = true where id = v_produto_a;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(
    jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1)));
  perform pg_temp.ok((select para_viagem from public.itens_pedido where pedido_id = (v_json ->> 'pedido_id')::uuid),
                     'produto marcado pelo dono sai pra viagem por padrão');
  v_json := public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(
    jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1, 'para_viagem', false)));
  perform pg_temp.ok((select not para_viagem from public.itens_pedido where pedido_id = (v_json ->> 'pedido_id')::uuid),
                     'garçom pode tirar o pra viagem do padrão');
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.produtos set para_viagem = false where id = v_produto_a;
  begin
    insert into public.produto_etapas (restaurante_id, produto_id, estacao_id) values (a, v_produto_a, v_chapa_a);
    perform pg_temp.entrar('garcom1.brasa@exemplo.com');
    insert into public.produto_etapas (restaurante_id, produto_id, estacao_id) values (a, v_produto_a2, v_churrasqueira_a);
    perform pg_temp.ok(false, 'garçom não muda a rota de preparo');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'garçom não muda a rota de preparo');
  end;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');

  begin
    insert into public.grupos_adicionais (restaurante_id, nome) values (a, 'Do garçom');
    perform pg_temp.ok(false, 'garçom não cria grupo de adicionais');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'garçom não cria grupo de adicionais');
  end;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.adicionais set disponivel = false where id = v_ovo;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    perform public.lancar_itens_comanda(v_comanda_a, jsonb_build_array(jsonb_build_object(
      'produto_id', v_burger_bacon, 'quantidade', 1, 'adicionais', jsonb_build_array(v_ponto, v_ovo))));
    perform pg_temp.ok(false, 'opção indisponível é recusada');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Adicional indisponível: Ovo%', 'opção indisponível é recusada');
  end;

  perform pg_temp.entrar('dono.burger@exemplo.com');
  update public.grupos_adicionais set nome = 'Invadido' where restaurante_id = a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'dono de B não edita grupos de A');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');

  -- Comanda precisa estar fechada para o caixa fechar no fim do teste.
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma)
  values (a, v_comanda_a, (select total from public.comandas where id = v_comanda_a), 'pix');
  update public.comandas set status = 'fechada' where id = v_comanda_a;
  perform pg_temp.entrar('dono.brasa@exemplo.com');

  -- Usuário de dois restaurantes vê os dois, e só eles.
  perform pg_temp.entrar('multi@exemplo.com');
  select count(distinct restaurante_id) into n from public.membros where user_id = md5('multi@exemplo.com')::uuid;
  perform pg_temp.ok(n = 2, 'usuário multi vê seus dois vínculos');
  select count(*) into n from public.mesas where restaurante_id = md5('espeto-da-praca')::uuid;
  perform pg_temp.ok(n = 0, 'usuário multi não vê o restaurante C');

  -- ======================================================================
  -- Público (anon)
  -- ======================================================================
  select max(numero) into v_num1 from public.pedidos where caixa_sessao_id = v_caixa_a;
  perform pg_temp.anonimo();
  select count(*) into n from public.restaurantes_publicos;
  perform pg_temp.ok(n = 3, 'anon lê restaurantes públicos');
  select count(*) into n from public.produtos where restaurante_id = a;
  perform pg_temp.ok(n = 6, 'anon lê só produtos do delivery (6 de 7 em A)');
  begin
    select count(*) into n from public.membros;
    perform pg_temp.ok(false, 'anon não lê membros');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anon não lê membros');
  end;
  begin
    select count(*) into n from public.pedidos;
    perform pg_temp.ok(false, 'anon não lê pedidos');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anon não lê pedidos');
  end;
  begin
    insert into public.pedidos (restaurante_id, origem, cliente_nome, cliente_telefone, bairro_id)
    values (a, 'delivery', 'x', '69999999999', v_bairro_a);
    perform pg_temp.ok(false, 'anon não insere pedido direto');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anon não insere pedido direto');
  end;

  v_json := public.criar_pedido_delivery(
    a, 'Maria Cliente', '(69) 99999-1234', v_bairro_a,
    '{"rua": "Rua A", "numero": "10"}'::jsonb, 'dinheiro',
    jsonb_build_array(
      jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 2, 'observacao', 'sem cebola'),
      jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1, 'preco', 1)
    ),
    50000
  );
  -- 2 x 3200 + 1 x 9999 (preço alterado acima) + taxa 500
  perform pg_temp.ok((v_json ->> 'total')::integer = 2 * 3200 + 9999 + 500, 'delivery: total calculado no banco (16899)');
  v_num2 := (v_json ->> 'numero')::integer;
  perform pg_temp.ok(v_num2 = v_num1 + 1, 'número do pedido sequencial na sessão');

  v_json := public.consultar_pedido_publico((v_json ->> 'id')::uuid);
  perform pg_temp.ok(v_json ->> 'status' = 'recebido' and jsonb_array_length(v_json -> 'itens') = 2,
                     'acompanhamento público retorna status e itens');
  perform pg_temp.ok(not (v_json ? 'cliente_telefone') and not (v_json ? 'endereco'),
                     'acompanhamento não expõe dados do cliente');

  select count(*) into n from public.grupos_adicionais where restaurante_id = a;
  perform pg_temp.ok(n = 2, 'anon lê os grupos de opções ativos');
  begin
    insert into public.adicionais (restaurante_id, grupo_id, nome) values (a, md5('brasa-espetinhos/grupo/Ponto da carne')::uuid, 'X');
    perform pg_temp.ok(false, 'anon não cria opções');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anon não cria opções');
  end;
  -- Pedido com opções, desfeito no fim do bloco para não alterar os testes seguintes.
  v_teste := null;
  begin
    v_json := public.criar_pedido_delivery(a, 'Ana', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', v_burger_bacon, 'quantidade', 1,
                                           'adicionais', jsonb_build_array(v_ponto, v_bacon))));
    v_teste := (v_json ->> 'total')::integer;
    v_json := public.consultar_pedido_publico((v_json ->> 'id')::uuid);
    raise exception 'desfazer';
  exception when others then
    if sqlerrm <> 'desfazer' then v_teste := -1; end if;
  end;
  perform pg_temp.ok(v_teste = 3600 + 500 + 500, 'delivery soma as opções no total (com taxa)');

  perform pg_temp.ok(jsonb_array_length(v_json -> 'itens' -> 0 -> 'adicionais') = 2
                     and v_json -> 'itens' -> 0 -> 'adicionais' -> 1 ->> 'nome' = 'Bacon extra',
                     'acompanhamento público mostra as opções do item');
  v_status := null;
  begin
    v_json := public.criar_pedido_delivery(a, 'Bia', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1),
                        jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)));
    perform pg_temp.entrar('caixa.brasa@exemplo.com');
    if exists (select 1 from public.itens_pedido where pedido_id = (v_json ->> 'id')::uuid and not para_viagem) then
      raise exception 'delivery com item que não é pra viagem';
    end if;
    update public.pedidos set status = 'em_preparo' where id = (v_json ->> 'id')::uuid;
    perform pg_temp.entrar('cozinha.brasa@exemplo.com');
    update public.tarefas_producao set status = 'pronto' where pedido_id = (v_json ->> 'id')::uuid and estacao_id = v_chapa_a;
    select status into v_status from public.pedidos where id = (v_json ->> 'id')::uuid;
    update public.tarefas_producao set status = 'pronto' where pedido_id = (v_json ->> 'id')::uuid and estacao_id = v_churrasqueira_a;
    select v_status || '>' || status into v_status from public.pedidos where id = (v_json ->> 'id')::uuid;
    raise exception 'desfazer';
  exception when others then
    if sqlerrm <> 'desfazer' then v_status := sqlerrm; end if;
  end;
  perform pg_temp.ok(v_status = 'em_preparo>pronto', 'delivery fica pronto só quando todas as praças terminam');

  -- Envio repetido devolve o mesmo pedido; total diferente do visto é recusado.
  v_status := null;
  begin
    v_json := public.criar_pedido_delivery(a, 'Rep', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)), null, null,
      '11111111-1111-1111-1111-111111111111', 3200 + 500);
    v_status := (public.criar_pedido_delivery(a, 'Rep', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)), null, null,
      '11111111-1111-1111-1111-111111111111', 3200 + 500) ->> 'id' = v_json ->> 'id')::text;
    perform pg_temp.admin();
    select v_status || '>' || count(*) into v_status from public.pedidos
    where chave_idempotencia = '11111111-1111-1111-1111-111111111111';
    perform pg_temp.anonimo();
    begin
      perform public.criar_pedido_delivery(a, 'Rep', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
        jsonb_build_array(jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)), null, null, null, 3000);
      v_status := v_status || '>aceitou';
    exception when others then
      v_status := v_status || case when sqlerrm like '%(precos_mudaram)' then '>ok' else '>' || sqlerrm end;
    end;
    raise exception 'desfazer';
  exception when others then
    if sqlerrm <> 'desfazer' then v_status := sqlerrm; end if;
  end;
  perform pg_temp.ok(v_status = 'true>1>ok', 'delivery: envio repetido não duplica e preço mudado é avisado (' || v_status || ')');

  -- Transições do delivery: não pula o aceite, não volta e encerra os tickets ao adiantar.
  v_status := null;
  begin
    v_json := public.criar_pedido_delivery(a, 'Ana', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1),
                        jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)));
    perform pg_temp.entrar('caixa.brasa@exemplo.com');
    begin
      update public.pedidos set status = 'pronto' where id = (v_json ->> 'id')::uuid;
      v_status := 'pulou o aceite';
    exception when others then
      v_status := case when sqlerrm like 'Aceite o pedido%' then 'ok' else sqlerrm end;
    end;
    update public.pedidos set status = 'em_preparo', aceito_em = '2000-01-01' where id = (v_json ->> 'id')::uuid;
    select v_status || '>' || (aceito_em > now() - interval '1 minute')::text into v_status from public.pedidos
    where id = (v_json ->> 'id')::uuid;
    select v_status || '>' || count(*) into v_status from public.tarefas_producao
    where pedido_id = (v_json ->> 'id')::uuid and status = 'pendente';
    update public.pedidos set status = 'saiu_entrega' where id = (v_json ->> 'id')::uuid;
    select v_status || '>' || count(*) into v_status from public.tarefas_producao
    where pedido_id = (v_json ->> 'id')::uuid and status = 'pendente';
    begin
      update public.pedidos set status = 'em_preparo' where id = (v_json ->> 'id')::uuid;
      v_status := v_status || '>voltou';
    exception when others then
      v_status := v_status || case when sqlerrm like 'O pedido não pode voltar%' then '>ok' else '>' || sqlerrm end;
    end;
    raise exception 'desfazer';
  exception when others then
    if sqlerrm <> 'desfazer' then v_status := sqlerrm; end if;
  end;
  perform pg_temp.ok(v_status = 'ok>true>2>0>ok', 'delivery não pula o aceite, não volta, guarda a hora do aceite e encerra os tickets (' || v_status || ')');

  begin
    perform public.criar_pedido_delivery(a, 'Maria', '69999991234', v_bairro_a, '{"rua": "R", "numero": "1"}',
      'pix', jsonb_build_array(jsonb_build_object('produto_id', v_produto_b, 'quantidade', 1)));
    perform pg_temp.ok(false, 'delivery recusa produto de outro restaurante');
  exception when others then
    perform pg_temp.ok(true, 'delivery recusa produto de outro restaurante');
  end;
  begin
    perform public.criar_pedido_delivery(a, 'Maria', '69999991234', v_bairro_b, '{"rua": "R", "numero": "1"}',
      'pix', jsonb_build_array(jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)));
    perform pg_temp.ok(false, 'delivery recusa bairro de outro restaurante');
  exception when others then
    perform pg_temp.ok(sqlerrm = 'Bairro não atendido.', 'delivery recusa bairro de outro restaurante');
  end;
  begin
    perform public.criar_pedido_delivery(a, 'Maria', '69999991234', v_bairro_a, '{"rua": "R", "numero": "1"}',
      'pix', jsonb_build_array(jsonb_build_object('produto_id', v_cerveja_a, 'quantidade', 1)));
    perform pg_temp.ok(false, 'delivery recusa produto só de salão');
  exception when others then
    perform pg_temp.ok(true, 'delivery recusa produto só de salão');
  end;
  begin
    perform public.criar_pedido_delivery(a, 'Maria', '69999991234', v_bairro_a, '{"rua": "R", "numero": "1"}',
      'pix', jsonb_build_array(jsonb_build_object('produto_id', md5('brasa-espetinhos/Bebidas/Refrigerante lata')::uuid, 'quantidade', 1)));
    perform pg_temp.ok(false, 'delivery respeita pedido mínimo');
  exception when others then
    perform pg_temp.ok(sqlerrm = 'Pedido mínimo não atingido.', 'delivery respeita pedido mínimo');
  end;
  begin
    perform public.criar_pedido_delivery(md5('espeto-da-praca')::uuid, 'Maria', '69999991234',
      (select id from public.bairros_entrega where nome = 'Centro Norte'), '{"rua": "R", "numero": "1"}',
      'pix', jsonb_build_array(jsonb_build_object('produto_id', md5('espeto-da-praca/Espetos/Espeto misto')::uuid, 'quantidade', 1)));
    perform pg_temp.ok(false, 'delivery recusa restaurante sem delivery');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Restaurante não está recebendo pedidos%', 'delivery recusa restaurante sem delivery');
  end;

  -- ======================================================================
  -- Impressão: fila (tudo desfeito no fim; os resultados são conferidos depois)
  -- ======================================================================
  v_res := '{}';
  begin
    perform pg_temp.entrar('dono.brasa@exemplo.com');
    insert into public.impressoras (restaurante_id, nome, conexao, endereco, imprime_conta, imprime_via_delivery)
    values (a, 'Chapa', 'rede', '192.168.0.50', true, true) returning id into v_impressora;
    update public.estacoes set impressora_id = v_impressora where id = v_chapa_a;
    insert into public.agentes_impressao (restaurante_id, nome)
    values (a, 'Notebook do caixa') returning id into v_agente;
    -- O código só entra pela função (validade curta, sem repetir).
    perform public.definir_codigo_pareamento(v_agente, encode(sha256('123456'::bytea), 'hex'));
    begin
      update public.agentes_impressao set codigo_hash = 'outro', codigo_expira_em = now() + interval '1 year' where id = v_agente;
      v_res := v_res || text 'false|dono não grava código de pareamento direto';
    exception when insufficient_privilege then
      v_res := v_res || text 'true|dono não grava código de pareamento direto';
    end;
    begin
      perform codigo_hash from public.agentes_impressao where id = v_agente;
      v_res := v_res || text 'false|dono não lê o hash do código de pareamento';
    exception when insufficient_privilege then
      v_res := v_res || text 'true|dono não lê o hash do código de pareamento';
    end;

    perform pg_temp.entrar('garcom1.brasa@exemplo.com');
    insert into public.comandas (restaurante_id, mesa_id)
    select a, id from public.mesas where restaurante_id = a and numero = '9'
    returning id into v_comanda_imp;
    v_json := public.lancar_itens_comanda(v_comanda_imp, jsonb_build_array(
      jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1),
      jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1)));
    select count(*) into n from public.fila_impressao where restaurante_id = a;
    v_res := v_res || ((n = 0)::text || '|garçom não vê a fila de impressão');
    begin
      insert into public.fila_impressao (restaurante_id, impressora_id, tipo) values (a, v_impressora, 'teste');
      v_res := v_res || text 'false|garçom não escreve direto na fila';
    exception when insufficient_privilege then
      v_res := v_res || text 'true|garçom não escreve direto na fila';
    end;
    n := public.imprimir_conta(v_comanda_imp);
    v_res := v_res || ((n = 1)::text || '|conta vai para a impressora de conta');

    perform pg_temp.admin();
    select count(*) into n from public.fila_impressao where pedido_id = (v_json ->> 'pedido_id')::uuid and tipo = 'producao';
    v_res := v_res || ((n = 1)::text || '|só o ticket da praça com impressora entra na fila');

    perform pg_temp.entrar('dono.burger@exemplo.com');
    begin
      perform public.imprimir_teste(v_impressora);
      v_res := v_res || text 'false|B não imprime teste na impressora de A';
    exception when others then
      v_res := v_res || ((sqlerrm like 'Impressora não encontrada%')::text || '|B não imprime teste na impressora de A');
    end;
    perform pg_temp.entrar('dono.brasa@exemplo.com');
    begin
      perform public.agente_pegar_trabalhos(v_agente, 5);
      v_res := v_res || text 'false|só o servidor fala pelo agente';
    exception when insufficient_privilege then
      v_res := v_res || text 'true|só o servidor fala pelo agente';
    end;

    perform pg_temp.admin();
    update public.agentes_impressao set token_hash = 'hash-do-token', pareado_em = now() where id = v_agente;
    select count(*) into n from public.agente_pegar_trabalhos(v_agente, 10);
    v_res := v_res || ((n = 2)::text || '|agente pega os trabalhos pendentes (ticket e conta)');
    select count(*) into n from public.agente_pegar_trabalhos(v_agente, 10);
    v_res := v_res || ((n = 0)::text || '|trabalho pego não é entregue de novo');

    select id into v_fila from public.fila_impressao where pedido_id = (v_json ->> 'pedido_id')::uuid and tipo = 'producao';
    perform public.agente_concluir(v_agente, v_fila, true);
    v_res := v_res || ((select status = 'impresso' from public.fila_impressao where id = v_fila)::text || '|agente confirma a impressão');

    perform pg_temp.entrar('garcom1.brasa@exemplo.com');
    update public.itens_pedido set cancelado_em = now(), motivo_cancelamento = 'desistiu'
    where pedido_id = (v_json ->> 'pedido_id')::uuid and produto_id = v_produto_a2;
    perform pg_temp.admin();
    select count(*) into n from public.fila_impressao where pedido_id = (v_json ->> 'pedido_id')::uuid and tipo = 'cancelamento';
    v_res := v_res || ((n = 1)::text || '|item cancelado depois de impresso gera aviso na praça');

    select id into v_fila from public.fila_impressao where comanda_id = v_comanda_imp and tipo = 'conta';
    perform public.agente_concluir(v_agente, v_fila, false, 'sem papel');
    v_res := v_res || ((select status = 'pendente' and erro = 'sem papel' from public.fila_impressao where id = v_fila)::text
                       || '|falha volta para a fila com o erro');

    perform pg_temp.anonimo();
    v_json := public.criar_pedido_delivery(a, 'Rui', '69999990000', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', v_produto_a2, 'quantidade', 1)));
    perform pg_temp.admin();
    select count(*) into n from public.fila_impressao where pedido_id = (v_json ->> 'id')::uuid;
    v_res := v_res || ((n = 0)::text || '|delivery não imprime antes do caixa aceitar');
    perform pg_temp.entrar('caixa.brasa@exemplo.com');
    update public.pedidos set status = 'em_preparo' where id = (v_json ->> 'id')::uuid;
    perform pg_temp.admin();
    select count(*) filter (where tipo = 'producao'), count(*) filter (where tipo = 'delivery') into n, n2
    from public.fila_impressao where pedido_id = (v_json ->> 'id')::uuid;
    v_res := v_res || ((n = 1 and n2 = 1)::text || '|delivery aceito imprime o ticket da praça e a via do motoboy');

    raise exception 'desfazer';
  exception when others then
    if sqlerrm <> 'desfazer' then
      v_res := v_res || ('false|bloco de impressão: ' || sqlerrm);
    end if;
  end;
  foreach v_linha in array v_res loop
    perform pg_temp.ok(split_part(v_linha, '|', 1)::boolean, split_part(v_linha, '|', 2));
  end loop;

  -- ======================================================================
  -- Fechamento de caixa
  -- ======================================================================
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  -- Sangria e suprimento: só caixa/dono, entram no resumo e não são alterados.
  insert into public.movimentos_caixa (restaurante_id, caixa_sessao_id, tipo, valor, motivo, registrado_por)
  values (a, '00000000-0000-0000-0000-000000000000', 'sangria', 5000, 'depósito no banco', '00000000-0000-0000-0000-000000000000');
  insert into public.movimentos_caixa (restaurante_id, caixa_sessao_id, tipo, valor, motivo, registrado_por)
  values (a, '00000000-0000-0000-0000-000000000000', 'suprimento', 2000, 'troco extra', '00000000-0000-0000-0000-000000000000');
  v_json := public.resumo_caixa_sessao(v_caixa_a);
  perform pg_temp.ok((v_json ->> 'sangrias')::integer = 5000 and (v_json ->> 'suprimentos')::integer = 2000
                     and jsonb_array_length(v_json -> 'movimentos') = 2,
                     'sangria e suprimento entram no resumo da sessão');
  begin
    update public.movimentos_caixa set valor = 1 where restaurante_id = a;
    perform pg_temp.ok(false, 'movimento de caixa não é alterado');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'movimento de caixa não é alterado');
  end;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    insert into public.movimentos_caixa (restaurante_id, caixa_sessao_id, tipo, valor, motivo, registrado_por)
    values (a, '00000000-0000-0000-0000-000000000000', 'sangria', 100, 'teste', '00000000-0000-0000-0000-000000000000');
    perform pg_temp.ok(false, 'garçom não faz sangria');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'garçom não faz sangria');
  end;
  perform pg_temp.entrar('dono.burger@exemplo.com');
  select count(*) into n from public.movimentos_caixa where restaurante_id = a;
  perform pg_temp.ok(n = 0, 'B não lê movimentos de caixa de A');
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  begin
    update public.caixa_sessoes set fechada_em = now(), valor_contado = 13200 where id = v_caixa_a;
    perform pg_temp.ok(false, 'não fecha caixa com delivery em andamento');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Existem pedidos de delivery%', 'não fecha caixa com delivery em andamento');
  end;
  -- Entrega com pagamento (RPC): outro restaurante não consegue; o próprio sim.
  perform pg_temp.entrar('caixa.burger@exemplo.com');
  begin
    perform public.entregar_pedido_delivery(
      (select id from public.pedidos where restaurante_id = a and origem = 'delivery' limit 1), 'pix');
    perform pg_temp.ok(false, 'B não entrega pedido de delivery de A');
  exception when others then
    perform pg_temp.ok(true, 'B não entrega pedido de delivery de A');
  end;
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  -- Entregar exige o aceite antes (o status não pula etapas).
  update public.pedidos set status = 'em_preparo' where restaurante_id = a and origem = 'delivery' and status = 'recebido';
  perform public.entregar_pedido_delivery(p.id, 'dinheiro')
  from public.pedidos p where p.restaurante_id = a and p.origem = 'delivery' and p.status not in ('entregue', 'cancelado');
  select count(*) into n from public.pedidos p
  where p.restaurante_id = a and p.caixa_sessao_id = v_caixa_a and p.origem = 'delivery' and p.status = 'entregue'
    and p.total = (select sum(valor) from public.pagamentos where pedido_id = p.id and estornado_em is null);
  perform pg_temp.ok(n = 1, 'entrega registra o pagamento do total e marca entregue');
  update public.caixa_sessoes set fechada_em = now(), valor_contado = 13200 where id = v_caixa_a;
  select count(*) into n from public.caixa_sessoes where id = v_caixa_a and fechada_por is not null;
  perform pg_temp.ok(n = 1, 'caixa fecha com valor contado');

  -- Resumo da sessão: só para o próprio restaurante.
  v_json := public.resumo_caixa_sessao(v_caixa_a);
  perform pg_temp.ok((v_json ->> 'total_recebido')::integer
                     = (select sum(valor) from public.pagamentos where caixa_sessao_id = v_caixa_a and estornado_em is null),
                     'resumo da sessão soma os pagamentos não estornados');
  perform pg_temp.entrar('dono.burger@exemplo.com');
  perform pg_temp.ok(public.resumo_caixa_sessao(v_caixa_a) is null, 'B não vê o resumo do caixa de A');

  -- ======================================================================
  -- Equipe
  -- ======================================================================
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  begin
    update public.membros set papel = 'caixa' where user_id = md5('dono.brasa@exemplo.com')::uuid;
    perform pg_temp.ok(false, 'restaurante mantém pelo menos um dono ativo');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'O restaurante precisa de pelo menos um dono%', 'restaurante mantém pelo menos um dono ativo');
  end;
  begin
    perform public.buscar_usuario_por_email('caixa.burger@exemplo.com');
    perform pg_temp.ok(false, 'usuário logado não busca usuários por e-mail');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'usuário logado não busca usuários por e-mail');
  end;

  -- ======================================================================
  -- Cadastro self-service e assinatura
  -- ======================================================================
  perform pg_temp.admin();
  begin
    insert into public.restaurantes (slug, nome) values ('cadastro', 'Rota reservada');
    perform pg_temp.ok(false, 'banco recusa endereço reservado');
  exception when check_violation then
    perform pg_temp.ok(true, 'banco recusa endereço reservado');
  end;
  select count(*) into n from public.assinaturas where restaurante_id in (a, b);
  perform pg_temp.ok(n = 2, 'restaurantes do seed têm assinatura');

  perform pg_temp.anonimo();
  begin
    perform public.criar_meu_restaurante('Anônimo', 'anonimo-teste', 'Fulano', 'America/Sao_Paulo');
    perform pg_temp.ok(false, 'anônimo não cria restaurante');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anônimo não cria restaurante');
  end;
  begin
    select count(*) into n from public.assinaturas;
    perform pg_temp.ok(false, 'anônimo não lê assinaturas');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'anônimo não lê assinaturas');
  end;

  perform pg_temp.entrar('multi@exemplo.com');
  perform pg_temp.ok(not public.slug_disponivel('brasa-espetinhos'), 'endereço em uso não está disponível');
  perform pg_temp.ok(not public.slug_disponivel('painel'), 'endereço reservado não está disponível');
  perform pg_temp.ok(not public.slug_disponivel('Com Espaço'), 'endereço inválido não está disponível');
  perform pg_temp.ok(public.slug_disponivel('novo-teste-1'), 'endereço livre está disponível');
  begin
    perform public.criar_meu_restaurante('Reservado', 'painel', 'Multi', 'America/Sao_Paulo');
    perform pg_temp.ok(false, 'cadastro recusa endereço reservado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Esse endereço é reservado%', 'cadastro recusa endereço reservado');
  end;
  begin
    perform public.criar_meu_restaurante('Copiado', 'burger-do-ze', 'Multi', 'America/Sao_Paulo');
    perform pg_temp.ok(false, 'cadastro recusa endereço em uso');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Esse endereço já está em uso%', 'cadastro recusa endereço em uso');
  end;

  v_novo := public.criar_meu_restaurante('Novo Teste', 'novo-teste-1', 'Multi Dono', 'America/Sao_Paulo', '69999990000', '#1d4ed8', '#facc15');
  select count(*) into n from public.membros where restaurante_id = v_novo and user_id = v_multi and papel = 'dono';
  perform pg_temp.ok(n = 1, 'quem cadastra vira dono do restaurante');
  select count(*) into n from public.assinaturas
  where restaurante_id = v_novo and status = 'teste'
    and teste_termina_em between now() + interval '13 days' and now() + interval '15 days';
  perform pg_temp.ok(n = 1, 'restaurante novo começa com 14 dias de teste');
  select count(*) into n from public.restaurantes
  where id = v_novo and horarios -> 'sex' -> 0 ->> 'abre' = '18:00' and horarios -> 'dom' -> 0 ->> 'fecha' = '23:00';
  perform pg_temp.ok(n = 1, 'restaurante novo nasce aberto das 18h às 23h');
  select count(*) into n from public.assinaturas where restaurante_id = a;
  perform pg_temp.ok(n = 0, 'garçom de A não lê a assinatura de A');
  begin
    update public.assinaturas set status = 'ativa' where restaurante_id = v_novo;
    perform pg_temp.ok(false, 'dono não altera a própria assinatura');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'dono não altera a própria assinatura');
  end;

  perform public.criar_meu_restaurante('Novo Teste 2', 'novo-teste-2', 'Multi Dono', 'America/Sao_Paulo');
  perform public.criar_meu_restaurante('Novo Teste 3', 'novo-teste-3', 'Multi Dono', 'America/Sao_Paulo');
  begin
    perform public.criar_meu_restaurante('Novo Teste 4', 'novo-teste-4', 'Multi Dono', 'America/Sao_Paulo');
    perform pg_temp.ok(false, 'limite de 3 restaurantes por conta');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Limite de restaurantes%', 'limite de 3 restaurantes por conta');
  end;

  perform pg_temp.entrar('dono.burger@exemplo.com');
  select count(*) into n from public.assinaturas;
  perform pg_temp.ok(n = 1, 'dono de B só vê a assinatura de B');

  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Conta do cliente do delivery (telefone confirmado)
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  b constant uuid := md5('burger-do-ze')::uuid;
  v_cli constant uuid := md5('cliente.telefone')::uuid;
  v_outro constant uuid := md5('cliente.outro')::uuid;
  v_sem constant uuid := md5('cliente.sem.confirmar')::uuid;
  v_produto_a uuid := md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid;
  v_bairro_a uuid;
  v_cliente_a uuid;
  v_json jsonb;
  v_pedido uuid;
  n integer;
begin
  perform pg_temp.admin();
  insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_cli, 'authenticated', 'authenticated', '5569999990001', now(), '{"provider": "phone"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_outro, 'authenticated', 'authenticated', '5569999990002', now(), '{"provider": "phone"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_sem, 'authenticated', 'authenticated', '5569999990003', null, '{"provider": "phone"}', '{}', now(), now());
  update public.restaurantes set horarios = (
    select jsonb_object_agg(d, '[{"abre": "00:00", "fecha": "00:00"}]'::jsonb)
    from unnest(array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']) d
  ) where id = a;
  select id into v_bairro_a from public.bairros_entrega where restaurante_id = a and ativo limit 1;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;

  -- Sem telefone confirmado não vira cliente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sem, 'role', 'authenticated')::text, true);
  begin
    perform public.entrar_como_cliente(a, 'Sem Código');
    perform pg_temp.ok(false, 'cliente: exige telefone confirmado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Confirme o seu telefone%', 'cliente: exige telefone confirmado');
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
  v_cliente_a := public.entrar_como_cliente(a, '  Carla Cliente ');
  perform pg_temp.ok(public.entrar_como_cliente(a, 'Carla C.') = v_cliente_a, 'cliente: entrar de novo reaproveita o cadastro');
  select count(*) into n from public.clientes where id = v_cliente_a and nome = 'Carla C.' and telefone = '5569999990001';
  perform pg_temp.ok(n = 1, 'cliente: telefone vem do Auth, nome atualizado');
  begin
    insert into public.clientes (restaurante_id, user_id, nome, telefone) values (a, v_cli, 'Direto', '5569999990001');
    perform pg_temp.ok(false, 'cliente: não insere cadastro direto');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'cliente: não insere cadastro direto');
  end;
  begin
    update public.clientes set telefone = '5511111111111' where id = v_cliente_a;
    perform pg_temp.ok(false, 'cliente: não troca o telefone confirmado');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'cliente: não troca o telefone confirmado');
  end;

  -- Pedido com a conta: o vínculo e o endereço vêm do banco.
  v_json := public.criar_pedido_delivery(a, 'Carla', '69999990001', v_bairro_a,
    '{"rua": "Rua das Flores", "numero": "12", "complemento": "Casa 2"}', 'pix',
    jsonb_build_array(jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1)));
  v_pedido := (v_json ->> 'id')::uuid;
  perform pg_temp.admin();
  select count(*) into n from public.pedidos where id = v_pedido and cliente_id = v_cliente_a;
  perform pg_temp.ok(n = 1, 'cliente: pedido com a conta fica ligado ao cliente');

  perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.criar_pedido_delivery(a, 'Carla', '69999990001', v_bairro_a,
    '{"rua": "rua das flores", "numero": "12", "complemento": "casa 2", "referencia": "portão azul"}', 'pix',
    jsonb_build_array(jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1)));
  select count(*) into n from public.clientes_enderecos where cliente_id = v_cliente_a;
  perform pg_temp.ok(n = 1, 'cliente: mesmo endereço não duplica');
  select count(*) into n from public.clientes_enderecos where cliente_id = v_cliente_a and referencia = 'portão azul';
  perform pg_temp.ok(n = 1, 'cliente: endereço guardado com a referência mais recente');
  v_json := public.meus_pedidos_cliente(a);
  perform pg_temp.ok(jsonb_array_length(v_json) = 2, 'cliente: lista os próprios pedidos');
  perform pg_temp.ok(jsonb_array_length(public.meus_pedidos_cliente(b)) = 0, 'cliente: nada em outro restaurante');
  begin
    select count(*) into n from public.pedidos where cliente_id = v_cliente_a;
    perform pg_temp.ok(n = 0, 'cliente: não lê a tabela de pedidos');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'cliente: não lê a tabela de pedidos');
  end;

  -- Outro cliente não vê nada da Carla.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
  perform public.entrar_como_cliente(a, 'Outro');
  select count(*) into n from public.clientes where id = v_cliente_a;
  perform pg_temp.ok(n = 0, 'cliente: não lê o cadastro de outro cliente');
  select count(*) into n from public.clientes_enderecos where cliente_id = v_cliente_a;
  perform pg_temp.ok(n = 0, 'cliente: não lê endereços de outro cliente');
  perform pg_temp.ok(jsonb_array_length(public.meus_pedidos_cliente(a)) = 0, 'cliente: não lista pedidos de outro cliente');
  delete from public.clientes where id = v_cliente_a;
  perform pg_temp.admin();
  select count(*) into n from public.clientes where id = v_cliente_a;
  perform pg_temp.ok(n = 1, 'cliente: não exclui a conta de outro');

  -- Equipe: dono e caixa de A veem os clientes de A; garçom e outro restaurante não.
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  select count(*) into n from public.clientes where restaurante_id = a;
  perform pg_temp.ok(n = 2, 'cliente: caixa de A lê os clientes de A');
  begin
    update public.pedidos set cliente_id = (select id from public.clientes where user_id = v_outro and restaurante_id = a)
    where id = v_pedido;
  exception when others then
    null; -- recusado pelo banco (pedidos_campos_fixos)
  end;
  select count(*) into n from public.pedidos where id = v_pedido and cliente_id = v_cliente_a;
  perform pg_temp.ok(n = 1, 'cliente: equipe não troca o cliente do pedido');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  select count(*) into n from public.clientes;
  perform pg_temp.ok(n = 0, 'cliente: garçom não lê clientes');
  perform pg_temp.entrar('caixa.burger@exemplo.com');
  select count(*) into n from public.clientes;
  perform pg_temp.ok(n = 0, 'cliente: caixa de B não lê clientes de A');

  -- Pedido sem conta (anônimo) não tem cliente.
  perform pg_temp.anonimo();
  v_json := public.criar_pedido_delivery(a, 'Anônimo', '69999990009', v_bairro_a, '{"rua": "R", "numero": "1"}', 'pix',
    jsonb_build_array(jsonb_build_object('produto_id', v_produto_a, 'quantidade', 1)));
  perform pg_temp.admin();
  select count(*) into n from public.pedidos where id = (v_json ->> 'id')::uuid and cliente_id is null;
  perform pg_temp.ok(n = 1, 'cliente: pedido sem conta não tem cliente');

  -- Excluir a conta: some o cadastro e os endereços, o pedido fica sem vínculo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  delete from public.clientes where restaurante_id = a and user_id = v_cli;
  perform pg_temp.admin();
  select count(*) into n from public.clientes_enderecos where cliente_id = v_cliente_a;
  perform pg_temp.ok(n = 0, 'cliente: excluir a conta apaga os endereços');
  select count(*) into n from public.pedidos where id = v_pedido and cliente_id is null and cliente_nome = 'Carla';
  perform pg_temp.ok(n = 1, 'cliente: pedido continua, sem vínculo, após excluir a conta');

  -- Conta só com telefone não cria restaurante.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.criar_meu_restaurante('Do Cliente', 'do-cliente-1', 'Cliente', 'America/Sao_Paulo');
    perform pg_temp.ok(false, 'cliente: conta sem e-mail não cria restaurante');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Crie a conta do restaurante com um e-mail%', 'cliente: conta sem e-mail não cria restaurante');
  end;
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Relatórios do dono
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  b constant uuid := md5('burger-do-ze')::uuid;
  v_json jsonb;
  v_vendido bigint;
  v_produtos bigint;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  v_json := public.relatorio_vendas(a, (now() - interval '2 days')::date, (now() + interval '1 day')::date);
  perform pg_temp.ok((v_json ->> 'sessoes')::int >= 1, 'relatório: dono vê as sessões do período');
  select coalesce(sum((s ->> 'vendido')::bigint), 0) into v_vendido from jsonb_array_elements(v_json -> 'por_sessao') s;
  perform pg_temp.ok(v_vendido = (v_json ->> 'vendido')::bigint, 'relatório: soma das noites = total vendido');
  select coalesce(sum((p ->> 'vendido')::bigint), 0) into v_vendido from jsonb_array_elements(v_json -> 'por_origem') p;
  perform pg_temp.ok(v_vendido = (v_json ->> 'vendido')::bigint, 'relatório: soma por origem = total vendido');
  select coalesce(sum((p ->> 'total')::bigint), 0) into v_produtos from jsonb_array_elements(v_json -> 'produtos') p;
  perform pg_temp.ok(v_produtos + (v_json ->> 'taxas_entrega')::bigint = (v_json ->> 'vendido')::bigint,
                     'relatório: produtos + taxas = total vendido');

  begin
    perform public.relatorio_vendas(b, (now() - interval '2 days')::date, now()::date);
    perform pg_temp.ok(false, 'relatório: dono de A não vê o relatório de B');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Sem permissão%', 'relatório: dono de A não vê o relatório de B');
  end;

  begin
    perform public.relatorio_vendas(a, '2020-01-01', '2026-12-31');
    perform pg_temp.ok(false, 'relatório: período limitado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Escolha um período%', 'relatório: período limitado');
  end;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  begin
    perform public.relatorio_vendas(a, now()::date, now()::date);
    perform pg_temp.ok(false, 'relatório: caixa não vê os relatórios');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Sem permissão%', 'relatório: caixa não vê os relatórios');
  end;

  perform pg_temp.anonimo();
  begin
    perform public.relatorio_vendas(a, now()::date, now()::date);
    perform pg_temp.ok(false, 'relatório: anônimo não chama');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'relatório: anônimo não chama');
  end;
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Painel da plataforma (super admin)
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_admin constant uuid := md5('admin.plataforma@exemplo.com')::uuid;
  v_json jsonb;
  n integer;
begin
  perform pg_temp.admin();
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.plataforma@exemplo.com',
          '{"provider": "email"}', '{}', now(), now());
  insert into rest_privado.administradores (user_id) values (v_admin);
  -- Segunda etapa (código por e-mail) já confirmada nesta sessão de teste; testes próprios mais abaixo.
  insert into rest_privado.admin_sessoes (session_id, user_id, expira_em)
  values (md5('admin.plataforma@exemplo.com:sessao')::uuid, v_admin, now() + interval '1 day');

  -- Dono de restaurante não é admin da plataforma.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  perform pg_temp.ok(not public.admin_sou_admin(), 'admin: dono de restaurante não é admin');
  begin
    perform public.admin_painel();
    perform pg_temp.ok(false, 'admin: dono não abre o painel da plataforma');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'admin: dono não abre o painel da plataforma');
  end;
  begin
    perform public.admin_definir_assinatura(a, 'cortesia', 'completo', null, null);
    perform pg_temp.ok(false, 'admin: dono não muda a própria assinatura pelo admin');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'admin: dono não muda a própria assinatura pelo admin');
  end;
  begin
    select count(*) into n from rest_privado.administradores;
    perform pg_temp.ok(false, 'admin: lista de admins fora do alcance do app');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'admin: lista de admins fora do alcance do app');
  end;

  perform pg_temp.anonimo();
  begin
    perform public.admin_painel();
    perform pg_temp.ok(false, 'admin: anônimo não chama');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'admin: anônimo não chama');
  end;

  -- Admin vê todos e altera com registro.
  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  perform pg_temp.ok(public.admin_sou_admin(), 'admin: admin é reconhecido');
  v_json := public.admin_painel();
  perform pg_temp.ok(jsonb_array_length(v_json -> 'restaurantes') >= 3, 'admin: vê todos os restaurantes');
  v_json := public.admin_restaurante(a);
  perform pg_temp.ok(v_json -> 'restaurante' ->> 'nome' is not null and jsonb_array_length(v_json -> 'equipe') > 0,
                     'admin: ficha do restaurante com a equipe');

  perform public.admin_definir_assinatura(a, 'cortesia', 'completo', null, null);
  perform pg_temp.admin();
  select count(*) into n from public.assinaturas where restaurante_id = a and status = 'cortesia';
  perform pg_temp.ok(n = 1, 'admin: muda a assinatura');
  select count(*) into n from rest_privado.admin_registros where restaurante_id = a and acao = 'assinatura' and user_id = v_admin;
  perform pg_temp.ok(n = 1, 'admin: alteração registrada');

  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  begin
    perform public.admin_definir_assinatura(a, 'teste', 'completo', null, null);
    perform pg_temp.ok(false, 'admin: teste exige data');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Informe até quando%', 'admin: teste exige data');
  end;
  begin
    perform public.admin_definir_ativo(a, false, '');
    perform pg_temp.ok(false, 'admin: desativar exige motivo');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Informe o motivo%', 'admin: desativar exige motivo');
  end;
  perform public.admin_definir_ativo(a, false, 'Teste de suspensão');
  perform pg_temp.anonimo();
  select count(*) into n from public.restaurantes_publicos where id = a;
  perform pg_temp.ok(n = 0, 'admin: restaurante desativado sai do site público');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Impressora comum: papel Folha A4 só pelo driver do Windows
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  n integer;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.impressoras (restaurante_id, nome, conexao, endereco, modo, largura)
  values (a, 'Teste A4 driver', 'windows', 'HP qualquer', 'driver', 210);
  select count(*) into n from public.impressoras where restaurante_id = a and nome = 'Teste A4 driver' and largura = 210;
  perform pg_temp.ok(n = 1, 'impressão: Folha A4 pelo driver é aceita');
  begin
    insert into public.impressoras (restaurante_id, nome, conexao, endereco, modo, largura)
    values (a, 'Teste A4 térmica', 'windows', 'Térmica qualquer', 'escpos', 210);
    perform pg_temp.ok(false, 'impressão: Folha A4 não vale no modo térmico');
  exception when check_violation then
    perform pg_temp.ok(true, 'impressão: Folha A4 não vale no modo térmico');
  end;
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Excluir computador pareado
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_pc uuid;
  n integer;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.agentes_impressao (restaurante_id, nome) values (a, 'PC criado por engano') returning id into v_pc;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  delete from public.agentes_impressao where id = v_pc;
  perform pg_temp.entrar('dono.burger@exemplo.com');
  delete from public.agentes_impressao where id = v_pc;
  perform pg_temp.admin();
  select count(*) into n from public.agentes_impressao where id = v_pc;
  perform pg_temp.ok(n = 1, 'computador: caixa e dono de outro restaurante não excluem');

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  delete from public.agentes_impressao where id = v_pc;
  perform pg_temp.admin();
  select count(*) into n from public.agentes_impressao where id = v_pc;
  perform pg_temp.ok(n = 0, 'computador: dono exclui o computador');
end;
$$;

-- ======================================================================
-- Garçom marca a praça; comanda fechada encerra os tickets
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_comanda uuid;
  v_tarefa uuid;
  v_total integer;
  n integer;
begin
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, pessoas)
  select a, m.id, 2 from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  order by m.ordem limit 1
  returning id into v_comanda;
  perform public.lancar_itens_comanda(v_comanda, jsonb_build_array(
    jsonb_build_object('produto_id', md5('brasa-espetinhos/Espetos/Espeto de carne')::uuid, 'quantidade', 1),
    jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 1)));
  select count(*) into n from public.tarefas_producao t join public.pedidos p on p.id = t.pedido_id
  where p.comanda_id = v_comanda and t.status = 'pendente';
  perform pg_temp.ok(n = 2, 'praças: itens da mesa geram um ticket por praça');

  -- O garçom (sem tela de cozinha) marca a praça como pronta.
  select t.id into v_tarefa from public.tarefas_producao t join public.pedidos p on p.id = t.pedido_id
  where p.comanda_id = v_comanda limit 1;
  update public.tarefas_producao set status = 'pronto' where id = v_tarefa;
  perform pg_temp.admin();
  select count(*) into n from public.tarefas_producao
  where id = v_tarefa and status = 'pronto' and pronto_por = (select id from public.membros where user_id = md5('garcom1.brasa@exemplo.com')::uuid and restaurante_id = a);
  perform pg_temp.ok(n = 1, 'praças: garçom marca o ticket como pronto (quem marcou vem do banco)');

  -- Fechar a comanda encerra o ticket que ficou pendente.
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  select total into v_total from public.comandas where id = v_comanda;
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda, v_total, 'pix');
  update public.comandas set status = 'fechada' where id = v_comanda;
  perform pg_temp.admin();
  select count(*) into n from public.tarefas_producao t join public.pedidos p on p.id = t.pedido_id
  where p.comanda_id = v_comanda and t.status = 'pendente';
  perform pg_temp.ok(n = 0, 'praças: comanda fechada encerra os tickets pendentes');
end;
$$;

-- ======================================================================
-- Taxa de entrega fixa (CEP + bairro digitado)
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_cli constant uuid := md5('cliente.taxa.fixa')::uuid;
  v_json jsonb;
  v_pedido uuid;
  n integer;
begin
  perform pg_temp.admin();
  update public.restaurantes set horarios = (
    select jsonb_object_agg(d, '[{"abre": "00:00", "fecha": "00:00"}]'::jsonb)
    from unnest(array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']) d
  ), ativo = true where id = a;  -- o teste do admin desativa A antes
  insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_cli, 'authenticated', 'authenticated', '5569999990077', now(), '{"provider": "phone"}', '{}', now(), now());

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.restaurantes set taxa_entrega_modo = 'fixa', taxa_entrega_fixa = 700 where id = a;

  perform pg_temp.anonimo();
  select count(*) into n from public.restaurantes_publicos where id = a and taxa_entrega_modo = 'fixa' and taxa_entrega_fixa = 700;
  perform pg_temp.ok(n = 1, 'taxa fixa: site público lê o modo e o valor');

  begin
    perform public.criar_pedido_delivery(a, 'Sem Bairro', '69999990066', null, '{"rua": "R", "numero": "1"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 1)));
    perform pg_temp.ok(false, 'taxa fixa: exige o bairro digitado');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Informe o bairro%', 'taxa fixa: exige o bairro digitado');
  end;

  -- Bairro qualquer (até um id de bairro cadastrado é ignorado): taxa fixa, sem vínculo com a lista.
  v_json := public.criar_pedido_delivery(a, 'Fixa', '69999990066', (select id from public.bairros_entrega where restaurante_id = a limit 1),
    '{"rua": "Rua Nova", "numero": "10", "bairro": "Jardim Novo", "cep": "76870-000", "cidade": "Ariquemes", "uf": "RO"}', 'pix',
    jsonb_build_array(jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 1)));
  v_pedido := (v_json ->> 'id')::uuid;
  perform pg_temp.admin();
  select count(*) into n from public.pedidos
  where id = v_pedido and taxa_entrega = 700 and bairro_id is null and endereco ->> 'bairro' = 'Jardim Novo' and total = 3200 + 700;
  perform pg_temp.ok(n = 1, 'taxa fixa: cobra o valor fixo e guarda o bairro digitado');

  -- Conta do cliente guarda o endereço com bairro digitado e CEP.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.entrar_como_cliente(a, 'Cliente Fixa');
  perform public.criar_pedido_delivery(a, 'Cliente Fixa', '69999990077', null,
    '{"rua": "Rua Nova", "numero": "10", "bairro": "Jardim Novo", "cep": "76870-000", "cidade": "Ariquemes", "uf": "RO"}', 'pix',
    jsonb_build_array(jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 1)));
  perform public.criar_pedido_delivery(a, 'Cliente Fixa', '69999990077', null,
    '{"rua": "rua nova", "numero": "10", "bairro": "jardim novo", "cep": "76870000"}', 'pix',
    jsonb_build_array(jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 1)));
  select count(*) into n from public.clientes_enderecos e join public.clientes c on c.id = e.cliente_id
  where c.user_id = v_cli and e.bairro_id is null and e.bairro = 'Jardim Novo' and e.cep = '76870000';
  perform pg_temp.ok(n = 1, 'taxa fixa: endereço salvo com bairro e CEP, sem duplicar');

  -- Voltar para "por bairro" exige um bairro da lista de novo.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.restaurantes set taxa_entrega_modo = 'bairro' where id = a;
  perform pg_temp.anonimo();
  begin
    perform public.criar_pedido_delivery(a, 'Bairro', '69999990066', null, '{"rua": "R", "numero": "1", "bairro": "Qualquer"}', 'pix',
      jsonb_build_array(jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 1)));
    perform pg_temp.ok(false, 'por bairro: exige bairro da lista');
  exception when others then
    perform pg_temp.ok(sqlerrm like 'Bairro não atendido%', 'por bairro: exige bairro da lista');
  end;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    update public.restaurantes set taxa_entrega_fixa = 1 where id = a;
    select count(*) into n from public.restaurantes where id = a and taxa_entrega_fixa = 1;
    perform pg_temp.ok(n = 0, 'taxa fixa: garçom não muda a taxa');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'taxa fixa: garçom não muda a taxa');
  end;
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Pagamento combinado e pessoas da mesa
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_comanda uuid;
  v_total integer;
  n integer;
begin
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, pessoas)
  select a, m.id, 2 from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  order by m.ordem limit 1
  returning id into v_comanda;
  perform public.lancar_itens_comanda(v_comanda, jsonb_build_array(
    jsonb_build_object('produto_id', md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid, 'quantidade', 2)));
  select total into v_total from public.comandas where id = v_comanda;

  -- Garçom muda a quantidade de pessoas com a mesa aberta.
  update public.comandas set pessoas = 5 where id = v_comanda;
  select count(*) into n from public.comandas where id = v_comanda and pessoas = 5;
  perform pg_temp.ok(n = 1, 'mesa: garçom muda a quantidade de pessoas');

  -- Várias formas num envio que passa do total: nenhuma é gravada.
  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma)
    values (a, v_comanda, v_total - 100, 'pix'), (a, v_comanda, 500, 'credito');
    perform pg_temp.ok(false, 'pagamento combinado: passou do total, nada gravado');
  exception when others then
    select count(*) into n from public.pagamentos where comanda_id = v_comanda;
    perform pg_temp.ok(n = 0, 'pagamento combinado: passou do total, nada gravado');
  end;

  -- Várias formas que fecham o total: todas gravadas e a comanda fecha.
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma)
  values (a, v_comanda, 1000, 'pix'), (a, v_comanda, 2000, 'credito'), (a, v_comanda, v_total - 3000, 'dinheiro');
  select count(*) into n from public.pagamentos where comanda_id = v_comanda and estornado_em is null;
  perform pg_temp.ok(n = 3, 'pagamento combinado: três formas gravadas');
  update public.comandas set status = 'fechada' where id = v_comanda;
  select count(*) into n from public.comandas where id = v_comanda and status = 'fechada';
  perform pg_temp.ok(n = 1, 'pagamento combinado: comanda quitada fecha');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Verificação de segurança (16/10): limites de cada papel
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_pedido uuid;
  v_sessao uuid;
  n integer;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  begin
    insert into public.membros (restaurante_id, user_id, nome, papel)
    select a, id, 'Intruso', 'dono' from auth.users where email = 'dono.burger@exemplo.com';
    perform pg_temp.ok(false, 'equipe: dono não insere membro direto pela API');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'equipe: dono não insere membro direto pela API');
  end;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;
  select id into v_sessao from public.caixa_sessoes where restaurante_id = a and fechada_em is null;
  begin
    update public.caixa_sessoes set ultimo_numero_pedido = 0 where id = v_sessao;
    perform pg_temp.ok(false, 'caixa: contador de pedidos não é editável');
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'caixa: contador de pedidos não é editável');
  end;

  -- Pedido de delivery de teste (criado direto, como faria o site).
  perform pg_temp.admin();
  insert into public.pedidos (restaurante_id, origem, cliente_nome, cliente_telefone, endereco, taxa_entrega, forma_pagamento_prevista, status)
  values (a, 'delivery', 'Teste', '69999990000', '{"rua":"A","numero":"1","bairro":"Centro"}', 700, 'pix', 'recebido')
  returning id into v_pedido;

  perform pg_temp.entrar('cozinha.brasa@exemplo.com');
  begin
    update public.pedidos set taxa_entrega = 0 where id = v_pedido;
    perform pg_temp.ok(false, 'delivery: cozinha não muda a taxa');
  exception when others then
    perform pg_temp.ok(true, 'delivery: cozinha não muda a taxa');
  end;
  begin
    update public.pedidos set status = 'cancelado', motivo_cancelamento = 'x' where id = v_pedido;
    select count(*) into n from public.pedidos where id = v_pedido and status = 'cancelado';
    perform pg_temp.ok(n = 0, 'delivery: cozinha não cancela');
  exception when others then
    perform pg_temp.ok(true, 'delivery: cozinha não cancela');
  end;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  update public.pedidos set status = 'cancelado', motivo_cancelamento = 'teste' where id = v_pedido;
  select count(*) into n from public.pedidos where id = v_pedido and status = 'cancelado';
  perform pg_temp.ok(n = 1, 'delivery: caixa cancela');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Editar pedido de delivery
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_pedido uuid;
  v_item uuid;
  v_produto uuid;
  v_res jsonb;
  n integer;
begin
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;

  perform pg_temp.admin();
  select id into v_produto from public.produtos p
  where restaurante_id = a and disponivel
    and not exists (select 1 from public.produtos_grupos_adicionais g where g.produto_id = p.id)
  order by nome limit 1;
  insert into public.pedidos (restaurante_id, origem, cliente_nome, cliente_telefone, endereco, taxa_entrega, forma_pagamento_prevista, status)
  values (a, 'delivery', 'Cliente Edição', '69999993333', '{"rua":"Rua C","numero":"3","bairro":"Centro"}', 500, 'pix', 'recebido')
  returning id into v_pedido;
  insert into public.itens_pedido (restaurante_id, pedido_id, produto_id, nome_produto, preco_unitario, quantidade)
  values (a, v_pedido, v_produto, '', 0, 2) returning id into v_item;

  -- Cozinha e garçom não mexem no delivery.
  perform pg_temp.entrar('cozinha.brasa@exemplo.com');
  begin
    update public.itens_pedido set cancelado_em = now(), motivo_cancelamento = 'x' where id = v_item;
    perform pg_temp.ok(false, 'editar delivery: cozinha não cancela item direto');
  exception when others then
    perform pg_temp.ok(true, 'editar delivery: cozinha não cancela item direto');
  end;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    perform public.editar_pedido_delivery(v_pedido, '{"taxa_entrega":0}');
    perform pg_temp.ok(false, 'editar delivery: garçom não edita');
  exception when others then
    perform pg_temp.ok(true, 'editar delivery: garçom não edita');
  end;

  -- Caixa edita taxa, endereço, adiciona e remove item; tudo registrado.
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  v_res := public.editar_pedido_delivery(
    v_pedido,
    '{"taxa_entrega":0,"endereco":{"numero":"30","complemento":"casa 2"}}',
    array[v_item],
    jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade', 1)),
    'Cliente pediu para trocar'
  );
  select count(*) into n from public.pedidos
  where id = v_pedido and taxa_entrega = 0 and endereco ->> 'numero' = '30' and endereco ->> 'rua' = 'Rua C'
    and total = (select sum(total) from public.itens_pedido where pedido_id = v_pedido and cancelado_em is null);
  perform pg_temp.ok(n = 1, 'editar delivery: taxa, endereço e total recalculado');
  select count(*) into n from public.itens_pedido where pedido_id = v_pedido and cancelado_em is null;
  perform pg_temp.ok(n = 1, 'editar delivery: item trocado');
  select count(*) into n from public.pedidos_alteracoes where pedido_id = v_pedido;
  perform pg_temp.ok(n = 4, 'editar delivery: quatro alterações registradas');

  begin
    perform public.editar_pedido_delivery(v_pedido, '{}', array[(select id from public.itens_pedido where pedido_id = v_pedido and cancelado_em is null)]);
    perform pg_temp.ok(false, 'editar delivery: não deixa o pedido sem itens');
  exception when others then
    perform pg_temp.ok(true, 'editar delivery: não deixa o pedido sem itens');
  end;
  begin
    perform public.editar_pedido_delivery(v_pedido, '{"forma_pagamento_prevista":"dinheiro","troco_para":1}');
    perform pg_temp.ok(false, 'editar delivery: troco menor que o total é recusado');
  exception when others then
    perform pg_temp.ok(true, 'editar delivery: troco menor que o total é recusado');
  end;

  -- Fora da edição, os campos continuam travados.
  begin
    update public.pedidos set taxa_entrega = 999 where id = v_pedido;
    perform pg_temp.ok(false, 'editar delivery: fora da edição a taxa não muda');
  exception when others then
    perform pg_temp.ok(true, 'editar delivery: fora da edição a taxa não muda');
  end;
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Taxa de serviço e couvert
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_comanda uuid;
  v_produto uuid;
  c record;
  n integer;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.restaurantes set servico_percentual = 10, couvert_valor = 500, couvert_dias = '{0,1,2,3,4,5,6}' where id = a;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, pessoas)
  select a, m.id, 2 from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas x where x.mesa_id = m.id and x.status in ('aberta', 'conta_pedida'))
  order by m.ordem limit 1
  returning id into v_comanda;
  select id into v_produto from public.produtos p
  where restaurante_id = a and disponivel and preco = 1000
    and not exists (select 1 from public.produtos_grupos_adicionais g where g.produto_id = p.id) limit 1;
  if v_produto is null then
    perform pg_temp.admin();
    insert into public.produtos (restaurante_id, categoria_id, nome, preco)
    select a, id, 'Teste serviço', 1000 from public.categorias where restaurante_id = a limit 1 returning id into v_produto;
    perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  end if;
  perform public.lancar_itens_comanda(v_comanda, jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade', 3)));

  select * into c from public.comandas where id = v_comanda;
  perform pg_temp.ok(c.subtotal = 3000 and c.servico = 300 and c.couvert = 1000 and c.total = 4300,
    'serviço: 10% sobre os itens e couvert por pessoa no total');

  update public.comandas set pessoas = 3 where id = v_comanda;
  select * into c from public.comandas where id = v_comanda;
  perform pg_temp.ok(c.couvert = 1500 and c.total = 4800, 'serviço: couvert acompanha as pessoas');

  update public.comandas set cobrar_servico = false where id = v_comanda;
  select * into c from public.comandas where id = v_comanda;
  perform pg_temp.ok(c.servico = 0 and c.total = 4500, 'serviço: garçom tira o serviço a pedido do cliente');

  -- Configuração nova não muda a mesa aberta.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.restaurantes set servico_percentual = 20 where id = a;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.comandas set cobrar_servico = true where id = v_comanda;
  select * into c from public.comandas where id = v_comanda;
  perform pg_temp.ok(c.servico = 300, 'serviço: percentual congelado na abertura da mesa');

  -- Pago o total, tirar o serviço deixaria o total abaixo do pago.
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda, c.total, 'pix');
  begin
    update public.comandas set cobrar_servico = false where id = v_comanda;
    perform pg_temp.ok(false, 'serviço: não tira depois de pago');
  exception when others then
    perform pg_temp.ok(true, 'serviço: não tira depois de pago');
  end;
  update public.comandas set status = 'fechada' where id = v_comanda;
  select count(*) into n from public.comandas where id = v_comanda and status = 'fechada' and servico = 300;
  perform pg_temp.ok(n = 1, 'serviço: comanda fecha com serviço e couvert pagos');

  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Cupom de desconto
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  burger constant uuid := md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid;
  v_json jsonb;
  n integer;
  itens jsonb;
  ende jsonb := '{"rua": "Rua C", "numero": "5", "bairro": "Centro"}';
begin
  itens := jsonb_build_array(jsonb_build_object('produto_id', burger, 'quantidade', 1));
  perform pg_temp.admin();
  update public.restaurantes set horarios = (
    select jsonb_object_agg(d, '[{"abre": "00:00", "fecha": "00:00"}]'::jsonb)
    from unnest(array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']) d
  ), ativo = true, aceita_delivery = true, pedido_minimo = 0 where id = a;
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.restaurantes set taxa_entrega_modo = 'fixa', taxa_entrega_fixa = 700 where id = a;
  insert into public.cupons (restaurante_id, codigo, tipo, valor, pedido_minimo, limite_usos, um_por_cliente) values
    (a, 'DEZ', 'percentual', 10, 0, null, false),
    (a, 'FRETE', 'frete', 0, 0, null, false),
    (a, 'MIN50', 'valor', 1000, 5000, null, false),
    (a, 'UNICO', 'valor', 500, 0, null, true);

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    insert into public.cupons (restaurante_id, codigo, tipo, valor) values (a, 'GARCOM', 'percentual', 50);
    perform pg_temp.ok(false, 'cupom: garçom não cria cupom');
  exception when others then
    perform pg_temp.ok(true, 'cupom: garçom não cria cupom');
  end;

  perform pg_temp.anonimo();
  v_json := public.validar_cupom(a, ' dez ');
  perform pg_temp.ok(v_json ->> 'tipo' = 'percentual' and (v_json ->> 'valor')::int = 10, 'cupom: site valida o código (sem diferenciar maiúsculas)');
  begin
    perform public.validar_cupom(a, 'NAOEXISTE');
    perform pg_temp.ok(false, 'cupom: código inexistente é recusado');
  exception when others then
    perform pg_temp.ok(true, 'cupom: código inexistente é recusado');
  end;

  v_json := public.criar_pedido_delivery(a, 'Cupom Dez', '69988880001', null, ende, 'pix', itens, null, null, null, null, 'dez');
  perform pg_temp.admin();
  select count(*) into n from public.pedidos
  where id = (v_json ->> 'id')::uuid and cupom_codigo = 'DEZ' and desconto = 320 and total = 3200 + 700 - 320;
  perform pg_temp.ok(n = 1, 'cupom: 10% sobre os itens');
  perform pg_temp.anonimo();

  v_json := public.criar_pedido_delivery(a, 'Cupom Frete', '69988880002', null, ende, 'pix', itens, null, null, null, null, 'FRETE');
  perform pg_temp.admin();
  select count(*) into n from public.pedidos where id = (v_json ->> 'id')::uuid and desconto = 700 and total = 3200;
  perform pg_temp.ok(n = 1, 'cupom: frete grátis');
  perform pg_temp.anonimo();

  begin
    perform public.criar_pedido_delivery(a, 'Cupom Min', '69988880003', null, ende, 'pix', itens, null, null, null, null, 'MIN50');
    perform pg_temp.ok(false, 'cupom: respeita o pedido mínimo do cupom');
  exception when others then
    perform pg_temp.ok(sqlerrm like '%(cupom)', 'cupom: respeita o pedido mínimo do cupom');
  end;

  perform public.criar_pedido_delivery(a, 'Cupom Unico', '69988880004', null, ende, 'pix', itens, null, null, null, null, 'UNICO');
  begin
    perform public.criar_pedido_delivery(a, 'Cupom Unico', '69988880004', null, ende, 'pix', itens, null, null, null, null, 'UNICO');
    perform pg_temp.ok(false, 'cupom: uma vez por telefone');
  exception when others then
    perform pg_temp.ok(sqlerrm like '%(cupom)', 'cupom: uma vez por telefone');
  end;

  -- Edição do pedido recalcula o desconto do cupom.
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  select id into v_json from (select jsonb_build_object('id', id) as id from public.pedidos where cupom_codigo = 'DEZ' and cliente_telefone = '69988880001') x;
  perform public.editar_pedido_delivery((v_json ->> 'id')::uuid, '{}', '{}',
    jsonb_build_array(jsonb_build_object('produto_id', burger, 'quantidade', 1)));
  select count(*) into n from public.pedidos where id = (v_json ->> 'id')::uuid and desconto = 640 and total = 6400 + 700 - 640;
  perform pg_temp.ok(n = 1, 'cupom: edição recalcula o desconto');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Entregadores
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  burger constant uuid := md5('brasa-espetinhos/Burgers/Burger artesanal')::uuid;
  v_taxa uuid;
  v_fixo uuid;
  v_pedido uuid;
  v_sessao uuid;
  v_json jsonb;
  n integer;
begin
  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
  end if;
  select id into v_sessao from public.caixa_sessoes where restaurante_id = a and fechada_em is null;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.entregadores (restaurante_id, nome, recebe_taxa) values (a, 'Moto Taxa', true) returning id into v_taxa;
  insert into public.entregadores (restaurante_id, nome, recebe_taxa, valor_por_entrega) values (a, 'Moto Fixo', false, 400) returning id into v_fixo;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  begin
    insert into public.entregadores (restaurante_id, nome) values (a, 'Caixa cria');
    perform pg_temp.ok(false, 'entregador: só o dono cadastra');
  exception when others then
    perform pg_temp.ok(true, 'entregador: só o dono cadastra');
  end;

  perform pg_temp.admin();
  insert into public.pedidos (restaurante_id, origem, cliente_nome, cliente_telefone, endereco, taxa_entrega, forma_pagamento_prevista, status)
  values (a, 'delivery', 'Entrega', '69977770001', '{"rua":"R","numero":"1","bairro":"Centro"}', 600, 'pix', 'recebido')
  returning id into v_pedido;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    update public.pedidos set entregador_id = v_taxa where id = v_pedido;
    perform pg_temp.ok(false, 'entregador: garçom não escolhe');
  exception when others then
    perform pg_temp.ok(true, 'entregador: garçom não escolhe');
  end;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  update public.pedidos set entregador_id = v_taxa where id = v_pedido;
  select count(*) into n from public.pedidos where id = v_pedido and valor_entregador = 600;
  perform pg_temp.ok(n = 1, 'entregador: recebe a taxa de entrega');
  update public.pedidos set entregador_id = v_fixo where id = v_pedido;
  select count(*) into n from public.pedidos where id = v_pedido and valor_entregador = 400;
  perform pg_temp.ok(n = 1, 'entregador: valor fixo por entrega');

  v_json := public.entregas_da_sessao(v_sessao);
  perform pg_temp.ok(exists (
    select 1 from jsonb_array_elements(v_json) x where x ->> 'nome' = 'Moto Fixo' and (x ->> 'valor')::int = 400 and (x ->> 'entregas')::int = 1
  ), 'entregador: acerto da noite por entregador');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Chamar garçom
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_g1 uuid;
  v_g2 uuid;
  v_dono uuid;
  v_outro uuid;
  v_chamado uuid;
  n integer;
begin
  perform pg_temp.admin();
  select id into v_g1 from public.membros where restaurante_id = a and nome = 'Garçom 1 (brasa)';
  select id into v_g2 from public.membros where restaurante_id = a and nome = 'Garçom 2 (brasa)';
  select id into v_dono from public.membros where restaurante_id = a and papel = 'dono' limit 1;
  select id into v_outro from public.membros where restaurante_id <> a and papel = 'garcom' limit 1;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  insert into public.chamados_garcom (restaurante_id, garcom_id, recado) values (a, v_g1, '  Vir ao caixa ') returning id into v_chamado;
  perform pg_temp.admin();
  select count(*) into n from public.chamados_garcom
  where id = v_chamado and recado = 'Vir ao caixa' and chamado_por is not null and atendido_em is null;
  perform pg_temp.ok(n = 1, 'chamado: caixa chama e o banco grava quem chamou');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    insert into public.chamados_garcom (restaurante_id, garcom_id) values (a, v_g2);
    perform pg_temp.ok(false, 'chamado: garçom não chama');
  exception when others then
    perform pg_temp.ok(true, 'chamado: garçom não chama');
  end;

  perform pg_temp.entrar('caixa.brasa@exemplo.com');
  begin
    insert into public.chamados_garcom (restaurante_id, garcom_id) values (a, v_dono);
    perform pg_temp.ok(false, 'chamado: só para garçom');
  exception when others then
    perform pg_temp.ok(true, 'chamado: só para garçom');
  end;
  begin
    insert into public.chamados_garcom (restaurante_id, garcom_id) values (a, v_outro);
    perform pg_temp.ok(false, 'chamado: garçom de outro restaurante');
  exception when others then
    perform pg_temp.ok(true, 'chamado: garçom de outro restaurante');
  end;

  -- O outro garçom não vê nem atende o chamado.
  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  select count(*) into n from public.chamados_garcom where id = v_chamado;
  perform pg_temp.ok(n = 0, 'chamado: outro garçom não vê');
  update public.chamados_garcom set atendido_em = now() where id = v_chamado;
  perform pg_temp.admin();
  select count(*) into n from public.chamados_garcom where id = v_chamado and atendido_em is null;
  perform pg_temp.ok(n = 1, 'chamado: outro garçom não atende');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  select count(*) into n from public.chamados_garcom where id = v_chamado;
  perform pg_temp.ok(n = 1, 'chamado: garçom vê o dele');
  update public.chamados_garcom set atendido_em = '2000-01-01' where id = v_chamado;
  perform pg_temp.admin();
  select count(*) into n from public.chamados_garcom where id = v_chamado and atendido_em > now() - interval '1 minute';
  perform pg_temp.ok(n = 1, 'chamado: garçom atende e a hora vem do banco');

  perform pg_temp.entrar('dono.burger@exemplo.com');
  select count(*) into n from public.chamados_garcom where restaurante_id = a;
  perform pg_temp.ok(n = 0, 'chamado: outro restaurante não vê');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Permissões: funções e ajustes por pessoa
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_g1 uuid;
  v_g2 uuid;
  v_caixa_funcao uuid;
  v_gerente uuid;
  v_pedido uuid;
  v_mesa uuid;
  v_comanda uuid;
  v_json jsonb;
  n integer;
begin
  perform pg_temp.admin();
  select id into v_g1 from public.membros where restaurante_id = a and nome = 'Garçom 1 (brasa)';
  select id into v_g2 from public.membros where restaurante_id = a and nome = 'Garçom 2 (brasa)';
  select id into v_caixa_funcao from public.funcoes where restaurante_id = a and padrao = 'caixa';
  perform pg_temp.ok((select count(*) from public.funcoes where restaurante_id = a and padrao is not null) = 3,
                     'permissões: restaurante tem as funções Caixa, Garçom e Cozinha');
  perform pg_temp.ok(rest_privado.permissoes_membro(v_g1) = array['garcom_app'],
                     'permissões: garçom antigo fica só com o app do garçom');
  perform pg_temp.ok((select rest_privado.permissoes_membro(m.id) from public.membros m where m.restaurante_id = a and m.papel = 'caixa' limit 1)
                     @> array['caixa_operar', 'delivery', 'comandas_gerenciar', 'garcom_app'],
                     'permissões: caixa antigo continua com a operação');
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    perform pg_temp.entrar('caixa.brasa@exemplo.com');
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
    perform pg_temp.admin();
  end if;

  -- Garçom não faz sangria nem vê relatórios; não mexe nas próprias permissões nem nas funções.
  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  begin
    insert into public.movimentos_caixa (restaurante_id, caixa_sessao_id, tipo, valor, motivo, registrado_por)
    values (a, zero, 'sangria', 100, 'teste de permissão', zero);
    perform pg_temp.ok(false, 'permissões: garçom não faz sangria');
  exception when others then
    perform pg_temp.ok(true, 'permissões: garçom não faz sangria');
  end;
  begin
    v_json := public.relatorio_vendas(a, current_date - 7, current_date);
    perform pg_temp.ok(false, 'permissões: garçom não vê relatórios');
  exception when others then
    perform pg_temp.ok(true, 'permissões: garçom não vê relatórios');
  end;
  update public.membros set permissoes_extras = array['relatorios'] where id = v_g2;
  update public.funcoes set permissoes = array['garcom_app', 'relatorios'] where restaurante_id = a and padrao = 'garcom';
  perform pg_temp.admin();
  perform pg_temp.ok(rest_privado.permissoes_membro(v_g2) = array['garcom_app'],
                     'permissões: garçom não se dá permissão nem muda a função');

  -- Dono: permissão a mais só para uma pessoa.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.membros set permissoes_extras = array['relatorios', 'relatorios'] where id = v_g2 and restaurante_id = a;
  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  v_json := public.relatorio_vendas(a, current_date - 7, current_date);
  perform pg_temp.ok(v_json is not null, 'permissões: garçom com "relatórios" a mais vê os relatórios');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    v_json := public.relatorio_vendas(a, current_date - 7, current_date);
    perform pg_temp.ok(false, 'permissões: a permissão a mais é só daquela pessoa');
  exception when others then
    perform pg_temp.ok(true, 'permissões: a permissão a mais é só daquela pessoa');
  end;
  perform pg_temp.admin();
  begin
    update public.membros set permissoes_extras = array['apagar_tudo'] where id = v_g2;
    perform pg_temp.ok(false, 'permissões: só permissões conhecidas');
  exception when others then
    perform pg_temp.ok(true, 'permissões: só permissões conhecidas');
  end;

  -- Função personalizada: Gerente = caixa + cardápio, sem estorno.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.funcoes (restaurante_id, nome, permissoes)
  values (a, ' Gerente ', array['caixa_operar', 'cardapio', 'delivery']) returning id into v_gerente;
  update public.membros set funcao_id = v_gerente, permissoes_extras = '{}' where id = v_g2 and restaurante_id = a;
  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  insert into public.movimentos_caixa (restaurante_id, caixa_sessao_id, tipo, valor, motivo, registrado_por)
  values (a, zero, 'suprimento', 100, 'teste de permissão', zero);
  perform pg_temp.ok(true, 'permissões: função personalizada libera o caixa');
  update public.categorias set nome = nome where restaurante_id = a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n > 0, 'permissões: função personalizada edita o cardápio');
  update public.mesas set numero = numero where restaurante_id = a;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'permissões: sem "mesas" não edita mesas');

  -- Delivery: quem tem aceita; quem não tem, não.
  perform pg_temp.admin();
  insert into public.pedidos (restaurante_id, origem, cliente_nome, cliente_telefone, endereco, taxa_entrega, forma_pagamento_prevista, status)
  values (a, 'delivery', 'Permissão', '69977770009', '{"rua":"R","numero":"1","bairro":"Centro"}', 500, 'pix', 'recebido')
  returning id into v_pedido;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    update public.pedidos set status = 'em_preparo' where id = v_pedido;
    perform pg_temp.ok(false, 'permissões: sem "delivery" não aceita delivery');
  exception when others then
    perform pg_temp.ok(true, 'permissões: sem "delivery" não aceita delivery');
  end;
  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  update public.pedidos set status = 'em_preparo' where id = v_pedido;
  perform pg_temp.admin();
  perform pg_temp.ok((select status from public.pedidos where id = v_pedido) = 'em_preparo',
                     'permissões: com "delivery" aceita delivery');

  -- Tirar só de uma pessoa: o caixa sem estorno.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.membros set permissoes_removidas = array['caixa_estornar']
  where restaurante_id = a and papel = 'caixa' and nome = 'Caixa (brasa)';
  perform pg_temp.admin();
  perform pg_temp.ok(not ('caixa_estornar' = any (rest_privado.permissoes_membro(
                       (select id from public.membros where restaurante_id = a and nome = 'Caixa (brasa)')))),
                     'permissões: tirada só daquela pessoa');
  perform pg_temp.ok((select 'caixa_estornar' = any (permissoes) from public.funcoes where id = v_caixa_funcao),
                     'permissões: a função continua com ela');

  -- Comandas: sem gerenciar, a mesa abre no próprio nome e não cancela.
  select id into v_mesa from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  limit 1;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, garcom_id, caixa_sessao_id)
  values (a, v_mesa, v_g2, zero) returning id into v_comanda;
  perform pg_temp.admin();
  perform pg_temp.ok((select garcom_id from public.comandas where id = v_comanda) = v_g1,
                     'permissões: sem "gerenciar mesas" a mesa abre no próprio nome');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  begin
    update public.comandas set status = 'cancelada' where id = v_comanda;
    perform pg_temp.ok(false, 'permissões: sem "gerenciar mesas" não cancela comanda');
  exception when others then
    perform pg_temp.ok(true, 'permissões: sem "gerenciar mesas" não cancela comanda');
  end;

  -- Função em uso não some; de outro restaurante, nem aparece.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  begin
    delete from public.funcoes where id = v_gerente;
    perform pg_temp.ok(false, 'permissões: função em uso não é excluída');
  exception when others then
    perform pg_temp.ok(true, 'permissões: função em uso não é excluída');
  end;
  perform pg_temp.entrar('dono.burger@exemplo.com');
  select count(*) into n from public.funcoes where restaurante_id = a;
  perform pg_temp.ok(n = 0, 'permissões: funções de outro restaurante não aparecem');
  begin
    update public.membros set funcao_id = v_gerente where restaurante_id <> a and papel <> 'dono';
    perform pg_temp.ok(false, 'permissões: não usa função de outro restaurante');
  exception when others then
    perform pg_temp.ok(true, 'permissões: não usa função de outro restaurante');
  end;
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Entregue na mesa (tickets das praças)
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_tarefa uuid;
  r record;
begin
  perform pg_temp.admin();
  select id into v_tarefa from public.tarefas_producao where restaurante_id = a limit 1;
  if v_tarefa is null then
    perform pg_temp.ok(true, 'entregue: sem ticket no seed (pulado)');
    return;
  end if;
  update public.tarefas_producao set status = 'pendente' where id = v_tarefa;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.tarefas_producao set retirada = true where id = v_tarefa;
  perform pg_temp.admin();
  perform pg_temp.ok(not (select retirada from public.tarefas_producao where id = v_tarefa), 'entregue: ticket em preparo não fica entregue');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.tarefas_producao set status = 'pronto', retirada = true where id = v_tarefa;
  perform pg_temp.admin();
  select status, retirada into r from public.tarefas_producao where id = v_tarefa;
  perform pg_temp.ok(r.status = 'pronto' and r.retirada, 'entregue: "Retirei" deixa pronto e entregue');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.tarefas_producao set retirada = false where id = v_tarefa;
  perform pg_temp.admin();
  perform pg_temp.ok((select retirada from public.tarefas_producao where id = v_tarefa), 'entregue: não volta atrás sozinho');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.tarefas_producao set status = 'pendente' where id = v_tarefa;
  perform pg_temp.admin();
  perform pg_temp.ok(not (select retirada from public.tarefas_producao where id = v_tarefa), 'entregue: "Desfazer" volta para preparo e apaga');

  update public.tarefas_producao set status = 'pronto' where id = v_tarefa;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.tarefas_producao set retirada = true where id = v_tarefa;
  perform pg_temp.admin();
  perform pg_temp.ok((select retirada from public.tarefas_producao where id = v_tarefa), 'entregue: "Entreguei" marca pedido já pronto');

  perform pg_temp.entrar('dono.burger@exemplo.com');
  update public.tarefas_producao set retirada = false where id = v_tarefa;
  perform pg_temp.admin();
  perform pg_temp.ok((select retirada from public.tarefas_producao where id = v_tarefa), 'entregue: outro restaurante não mexe');
end;
$$;

-- ======================================================================
-- Pedido pelo QR code da mesa
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  b constant uuid := md5('burger-do-ze')::uuid;
  v_mesa uuid;
  v_token uuid;
  v_token_b uuid;
  v_produto uuid;
  v_preco integer;
  v_r jsonb;
  v_r2 jsonb;
  v_comanda record;
  v_falhou boolean;
begin
  perform pg_temp.admin();
  select m.id, m.qr_token into v_mesa, v_token from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  order by m.numero limit 1;
  select qr_token into v_token_b from public.mesas where restaurante_id = b and ativa limit 1;
  select p.id, p.preco into v_produto, v_preco from public.produtos p
  where p.restaurante_id = a and p.disponivel
    and not exists (select 1 from public.produtos_grupos_adicionais g where g.produto_id = p.id)
  order by p.nome limit 1;
  if not exists (select 1 from public.caixa_sessoes where restaurante_id = a and fechada_em is null) then
    perform pg_temp.entrar('dono.brasa@exemplo.com');
    insert into public.caixa_sessoes (restaurante_id, valor_inicial) values (a, 0);
    perform pg_temp.admin();
  end if;
  update public.restaurantes set pedido_mesa_qr = false where id = a;

  perform pg_temp.anonimo();
  v_falhou := false;
  begin
    perform public.pedir_pela_mesa(v_token, jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade', 1)), gen_random_uuid(), null);
  exception when others then v_falhou := true;
  end;
  perform pg_temp.ok(v_falhou, 'mesa QR: desligado não aceita pedido');
  perform pg_temp.ok(public.mesa_por_qr(v_token) ->> 'pode_pedir' = 'false', 'mesa QR: desligado só mostra o cardápio');

  perform pg_temp.admin();
  update public.restaurantes set pedido_mesa_qr = true where id = a;
  perform pg_temp.anonimo();
  v_r := public.pedir_pela_mesa(v_token, jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade', 2)),
    '22222222-2222-2222-2222-222222222222', v_preco * 2);
  v_r2 := public.pedir_pela_mesa(v_token, '[]', '22222222-2222-2222-2222-222222222222', null);
  perform pg_temp.ok(v_r ->> 'pedido_id' = v_r2 ->> 'pedido_id', 'mesa QR: mesmo envio não duplica');
  perform pg_temp.ok((public.mesa_por_qr(v_token) -> 'conta' ->> 'subtotal')::integer = v_preco * 2, 'mesa QR: conta da mesa mostra o pedido');

  v_falhou := false;
  begin
    perform public.pedir_pela_mesa(v_token, jsonb_build_array(jsonb_build_object('produto_id', v_produto, 'quantidade', 1)), gen_random_uuid(), 1);
  exception when others then v_falhou := sqlerrm like '%(precos_mudaram)';
  end;
  perform pg_temp.ok(v_falhou, 'mesa QR: total diferente do visto é recusado');

  v_falhou := false;
  begin
    perform public.pedir_pela_mesa(gen_random_uuid(), '[]', gen_random_uuid(), null);
  exception when others then v_falhou := true;
  end;
  perform pg_temp.ok(v_falhou, 'mesa QR: código inventado é recusado');

  perform pg_temp.admin();
  select c.id, c.garcom_id, p.criado_por, (select count(*) from public.tarefas_producao t where t.pedido_id = p.id) as tickets
  into v_comanda
  from public.pedidos p join public.comandas c on c.id = p.comanda_id
  where p.id = (v_r ->> 'pedido_id')::uuid;
  perform pg_temp.ok(v_comanda.garcom_id is null and v_comanda.criado_por is null, 'mesa QR: mesa abre sem garçom e o pedido é do cliente');

  -- O garçom assume a mesa sem garçom; trocar depois continua só com permissão.
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.comandas set garcom_id = (select id from public.membros where restaurante_id = a and user_id = md5('garcom1.brasa@exemplo.com')::uuid)
  where id = v_comanda.id;
  perform pg_temp.admin();
  perform pg_temp.ok((select garcom_id from public.comandas where id = v_comanda.id) is not null, 'mesa QR: garçom assume a mesa aberta pelo cliente');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  v_falhou := false;
  begin
    update public.comandas set garcom_id = null where id = v_comanda.id;
  exception when others then v_falhou := true;
  end;
  perform pg_temp.ok(v_falhou, 'mesa QR: garçom não troca o garçom depois de assumida');

  -- O código de uma mesa de outro restaurante não lança aqui (vale só a mesa dele).
  -- "Junto com a comida": só para o que não passa pela cozinha.
  perform pg_temp.anonimo();
  v_r2 := public.pedir_pela_mesa(v_token, jsonb_build_array(
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Refrigerante lata'), 'quantidade', 1, 'com_a_comida', true),
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Espeto de carne'), 'quantidade', 1, 'com_a_comida', true)
  ), gen_random_uuid(), null);
  perform pg_temp.admin();
  perform pg_temp.ok(
    (select bool_and(servir_com_comida = (nome_produto = 'Refrigerante lata')) from public.itens_pedido where pedido_id = (v_r2 ->> 'pedido_id')::uuid),
    'mesa QR: "junto com a comida" vale só para o que não vai à cozinha');
  perform pg_temp.ok(
    (select bool_and(((p ->> 'preparo')::boolean) = (p ->> 'nome' <> 'Refrigerante lata' and p ->> 'nome' <> 'Cerveja long neck'))
     from jsonb_array_elements(public.cardapio_salao_publico(a)) c, jsonb_array_elements(c -> 'produtos') p),
    'mesa QR: cardápio diz o que passa pela cozinha');

  -- Pedido do cliente visto pelo garçom: quem e quando vêm do banco; ninguém apaga nem troca.
  perform pg_temp.entrar('dono.burger@exemplo.com');
  v_falhou := false;
  begin
    perform public.marcar_pedido_visto((v_r ->> 'pedido_id')::uuid);
  exception when others then v_falhou := true;
  end;
  perform pg_temp.ok(v_falhou, 'mesa QR: outro restaurante não marca como visto');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  perform public.marcar_pedido_visto((v_r ->> 'pedido_id')::uuid);
  update public.pedidos set visto_em = null, visto_por = null where id = (v_r ->> 'pedido_id')::uuid;
  perform pg_temp.admin();
  perform pg_temp.ok((select visto_em is not null and visto_por is not null from public.pedidos where id = (v_r ->> 'pedido_id')::uuid),
    'mesa QR: garçom marca o pedido como visto (e não desfaz)');

  perform pg_temp.anonimo();
  perform pg_temp.ok(public.mesa_por_qr(v_token_b) ->> 'restaurante_id' = b::text, 'mesa QR: código leva só à mesa do próprio restaurante');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Entregue por item na mesa
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_mesa uuid;
  v_comanda uuid;
  v_r jsonb;
  v_pedido uuid;
  v_refri uuid;
  v_espeto uuid;
  v_falhou boolean;
begin
  perform pg_temp.admin();
  select m.id into v_mesa from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  order by m.numero desc limit 1;

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, pessoas) values (a, v_mesa, 2) returning id into v_comanda;
  v_r := public.lancar_itens_comanda(v_comanda, jsonb_build_array(
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Refrigerante lata'), 'quantidade', 1),
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Espeto de carne'), 'quantidade', 1)
  ));
  v_pedido := (v_r ->> 'pedido_id')::uuid;
  select id into v_refri from public.itens_pedido where pedido_id = v_pedido and nome_produto = 'Refrigerante lata';
  select id into v_espeto from public.itens_pedido where pedido_id = v_pedido and nome_produto = 'Espeto de carne';

  update public.itens_pedido set entregue_em = '2000-01-01' where id = v_refri;
  perform pg_temp.admin();
  perform pg_temp.ok((select entregue_em > now() - interval '1 minute' and entregue_por is not null from public.itens_pedido where id = v_refri),
    'entregue por item: refri entregue antes, com hora e quem do banco');
  perform pg_temp.ok(exists (select 1 from public.tarefas_producao where pedido_id = v_pedido and status = 'pendente'),
    'entregue por item: espeto continua na cozinha');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.itens_pedido set entregue_em = now() where id = v_espeto;
  perform pg_temp.admin();
  perform pg_temp.ok(not exists (select 1 from public.tarefas_producao where pedido_id = v_pedido and not (status = 'pronto' and retirada)),
    'entregue por item: tudo entregue tira o ticket da cozinha');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  update public.itens_pedido set entregue_em = null where id = v_refri;
  perform pg_temp.admin();
  perform pg_temp.ok((select entregue_em is null and entregue_por is null from public.itens_pedido where id = v_refri), 'entregue por item: desfazer');

  perform pg_temp.entrar('dono.burger@exemplo.com');
  update public.itens_pedido set entregue_em = now() where id = v_refri;
  perform pg_temp.admin();
  perform pg_temp.ok((select entregue_em is null from public.itens_pedido where id = v_refri), 'entregue por item: outro restaurante não marca');

  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  v_falhou := false;
  begin
    update public.itens_pedido set total = 1, entregue_em = now() where id = v_refri;
  exception when others then v_falhou := true;
  end;
  perform pg_temp.admin();
  perform pg_temp.ok(v_falhou or (select total <> 1 from public.itens_pedido where id = v_refri), 'entregue por item: não mexe no preço');
end;
$$;

-- ======================================================================
-- Planos (o plano tira permissões de todos, inclusive do dono; no teste tudo liberado)
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_mesa uuid;
  v_token uuid;
  v_falhou boolean;
begin
  perform pg_temp.admin();
  update public.assinaturas set plano = 'delivery', status = 'ativa', periodo_termina_em = now() + interval '30 days' where restaurante_id = a;
  select m.id into v_mesa from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  limit 1;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  perform pg_temp.ok(not (public.minhas_permissoes(a) && array['comandas_painel', 'mesas', 'garcom_app']) and public.minhas_permissoes(a) @> array['delivery', 'caixa_operar', 'relatorios', 'cozinha_tela'],
    'plano delivery: dono sem mesas e sem app do garçom, com o resto');
  v_falhou := false;
  begin
    insert into public.comandas (restaurante_id, mesa_id, pessoas) values (a, v_mesa, 1);
  exception when others then v_falhou := true;
  end;
  perform pg_temp.ok(v_falhou, 'plano delivery: não abre mesa');
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  perform pg_temp.ok(not ('garcom_app' = any (public.minhas_permissoes(a))), 'plano delivery: garçom perde o app');

  perform pg_temp.admin();
  update public.assinaturas set plano = 'presencial' where restaurante_id = a;
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  perform pg_temp.ok(public.minhas_permissoes(a) @> array['comandas_painel', 'mesas'] and not ('garcom_app' = any (public.minhas_permissoes(a))),
    'plano presencial: mesas pelo caixa, sem app do garçom');

  perform pg_temp.admin();
  update public.assinaturas set plano = 'avancado' where restaurante_id = a;
  perform pg_temp.entrar('garcom1.brasa@exemplo.com');
  perform pg_temp.ok('garcom_app' = any (public.minhas_permissoes(a)), 'plano avançado: app do garçom');
  perform pg_temp.ok(not (select qr from public.meus_planos() where restaurante_id = a), 'plano avançado: sem pedido pelo QR');

  perform pg_temp.admin();
  update public.restaurantes set pedido_mesa_qr = true where id = a;
  select qr_token into v_token from public.mesas where id = v_mesa;
  perform pg_temp.anonimo();
  v_falhou := false;
  begin
    perform public.pedir_pela_mesa(v_token, '[]', gen_random_uuid(), null);
  exception when others then v_falhou := sqlerrm like '%desligados%';
  end;
  perform pg_temp.ok(v_falhou, 'plano avançado: QR da mesa não recebe pedido');

  perform pg_temp.admin();
  update public.assinaturas set plano = 'delivery', status = 'teste', teste_termina_em = now() + interval '7 days' where restaurante_id = a;
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  perform pg_temp.ok(public.minhas_permissoes(a) @> array['comandas_painel', 'garcom_app'] and (select qr from public.meus_planos() where restaurante_id = a),
    'teste grátis: tudo liberado');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Cobrança pelo Asaas (avisos do webhook)
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_falhou boolean;
  r record;
begin
  perform pg_temp.admin();
  update public.assinaturas set provedor = 'asaas', provedor_assinatura_id = 'sub_teste', status = 'teste', plano = 'avancado' where restaurante_id = a;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  v_falhou := false;
  begin
    perform public.processar_evento_asaas('{"id":"evt_x","event":"PAYMENT_RECEIVED","payment":{"subscription":"sub_teste"}}');
  exception when others then v_falhou := true;
  end;
  perform pg_temp.ok(v_falhou, 'asaas: dono não registra pagamento sozinho');
  v_falhou := false;
  begin
    update public.assinaturas set status = 'ativa' where restaurante_id = a;
  exception when others then v_falhou := true;
  end;
  perform pg_temp.admin();
  perform pg_temp.ok((select status from public.assinaturas where restaurante_id = a) = 'teste', 'asaas: dono não muda a assinatura pela API');

  perform public.processar_evento_asaas('{"id":"evt_1","event":"PAYMENT_CREATED","payment":{"subscription":"sub_teste","invoiceUrl":"https://www.asaas.com/i/1","dueDate":"2026-11-10"}}');
  perform pg_temp.ok((select fatura_url from public.assinaturas where restaurante_id = a) = 'https://www.asaas.com/i/1', 'asaas: fatura nova fica no botão Pagar');

  perform public.processar_evento_asaas('{"id":"evt_2","event":"PAYMENT_CONFIRMED","payment":{"subscription":"sub_teste","dueDate":"2026-11-10"}}');
  select * into r from public.assinaturas where restaurante_id = a;
  perform pg_temp.ok(r.status = 'ativa' and r.fatura_url is null and r.periodo_termina_em >= '2026-12-10'::date, 'asaas: pagamento confirmado ativa até o próximo vencimento');

  perform pg_temp.ok(public.processar_evento_asaas('{"id":"evt_2","event":"PAYMENT_CONFIRMED","payment":{"subscription":"sub_teste"}}') = 'repetido', 'asaas: aviso repetido não conta duas vezes');

  perform public.processar_evento_asaas('{"id":"evt_3","event":"PAYMENT_OVERDUE","payment":{"subscription":"sub_teste","invoiceUrl":"https://www.asaas.com/i/2"}}');
  select * into r from public.assinaturas where restaurante_id = a;
  perform pg_temp.ok(r.status = 'atrasada' and r.fatura_url = 'https://www.asaas.com/i/2', 'asaas: vencida fica atrasada com o link para pagar');
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  perform pg_temp.ok('garcom_app' = any (public.minhas_permissoes(a)), 'asaas: atraso não bloqueia o plano');
  perform pg_temp.admin();

  perform public.processar_evento_asaas('{"id":"evt_4","event":"PAYMENT_RECEIVED","payment":{"subscription":"sub_teste","dueDate":"2026-12-10"}}');
  perform pg_temp.ok((select status from public.assinaturas where restaurante_id = a) = 'ativa', 'asaas: pagou o atraso, volta a ativa');

  perform public.processar_evento_asaas('{"id":"evt_5","event":"SUBSCRIPTION_DELETED","subscription":{"id":"sub_teste"}}');
  perform pg_temp.ok((select status from public.assinaturas where restaurante_id = a) = 'cancelada', 'asaas: assinatura removida fica cancelada');
end;
$$;

-- ======================================================================
-- Painel da plataforma v2: financeiro, ficha, anotações e administradores
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_dono uuid := md5('dono.brasa@exemplo.com')::uuid;
  v_json jsonb;
  v_falhou boolean;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  v_falhou := false;
  begin perform public.admin_financeiro(); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'admin v2: dono não vê o financeiro da plataforma');
  v_falhou := false;
  begin perform public.admin_anotar(a, 'oi'); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'admin v2: dono não escreve anotação interna');
  v_falhou := false;
  begin perform public.admin_adicionar_admin('dono.brasa@exemplo.com'); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'admin v2: dono não se torna admin sozinho');

  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  v_json := public.admin_financeiro();
  perform pg_temp.ok(v_json ? 'por_plano' and v_json ? 'pagamentos', 'admin v2: financeiro abre');
  perform public.admin_anotar(a, 'Liguei para o dono');
  v_json := public.admin_restaurante_detalhes(a);
  perform pg_temp.ok(jsonb_array_length(v_json -> 'por_dia') = 30 and (v_json -> 'notas' -> 0 ->> 'texto') = 'Liguei para o dono',
    'admin v2: ficha com 30 dias e anotação');

  perform public.admin_adicionar_admin('dono.brasa@exemplo.com');
  perform pg_temp.ok(jsonb_array_length(public.admin_listar_admins()) = 2, 'admin v2: adiciona administrador');
  v_falhou := false;
  begin perform public.admin_remover_admin(md5('admin.plataforma@exemplo.com')::uuid); exception when others then v_falhou := sqlerrm like '%próprio acesso%'; end;
  perform pg_temp.ok(v_falhou, 'admin v2: não tira o próprio acesso');
  perform public.admin_remover_admin(v_dono);
  perform pg_temp.ok(jsonb_array_length(public.admin_listar_admins()) = 1, 'admin v2: tira administrador');
  perform pg_temp.admin();
  perform pg_temp.ok((select count(*) from rest_privado.admin_registros where acao in ('admin_adicionado', 'admin_removido')) = 2,
    'admin v2: mudanças de administrador registradas');
end;
$$;

-- ======================================================================
-- Super admin: módulos, equipe, criar restaurante
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_garcom uuid := (select id from public.membros where restaurante_id = md5('brasa-espetinhos')::uuid and user_id = md5('garcom1.brasa@exemplo.com')::uuid);
  v_dono uuid := (select id from public.membros where restaurante_id = md5('brasa-espetinhos')::uuid and user_id = md5('dono.brasa@exemplo.com')::uuid);
  v_funcao uuid := (select id from public.funcoes where restaurante_id = md5('brasa-espetinhos')::uuid and padrao = 'caixa');
  v_novo uuid;
  v_falhou boolean;
begin
  perform pg_temp.admin();
  update public.assinaturas set plano = 'avancado', status = 'ativa', modulos_liberados = '{}', modulos_bloqueados = '{}' where restaurante_id = a;

  -- Dono não mexe nos módulos nem na equipe pelo admin.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  v_falhou := false;
  begin perform public.admin_definir_modulos(a, array['qr'], '{}'); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'super admin: dono não libera módulo para si');
  v_falhou := false;
  begin perform public.admin_salvar_membro(v_garcom, 'X', 'dono', true); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'super admin: dono não usa a gestão de equipe do admin');

  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  perform public.admin_definir_modulos(a, array['qr'], array['relatorios']);
  perform pg_temp.admin();
  perform pg_temp.ok(rest_privado.plano_tem_qr(a), 'super admin: liberar QR fora do plano');
  perform pg_temp.ok(not ('relatorios' = any (rest_privado.permissoes_do_plano(a))), 'super admin: bloquear relatórios só deste restaurante');
  perform pg_temp.ok('garcom_app' = any (rest_privado.permissoes_do_plano(a)), 'super admin: o resto segue o plano');

  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  perform public.admin_salvar_membro(v_garcom, 'Garçom renomeado', v_funcao::text, false);
  perform pg_temp.admin();
  perform pg_temp.ok((select nome = 'Garçom renomeado' and not ativo and funcao_id = v_funcao from public.membros where id = v_garcom),
    'super admin: edita nome, função e desativa');
  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  v_falhou := false;
  begin perform public.admin_salvar_membro(v_dono, 'Dono', v_funcao::text, true); exception when others then v_falhou := sqlerrm like '%pelo menos um dono%'; end;
  perform pg_temp.ok(v_falhou, 'super admin: não deixa o restaurante sem dono');

  v_novo := public.admin_criar_restaurante(md5('caixa.brasa@exemplo.com')::uuid, 'Lanche Novo', 'lanche-novo', 'Fulano', 'America/Porto_Velho', null);
  perform pg_temp.admin();
  perform pg_temp.ok(exists (select 1 from public.membros where restaurante_id = v_novo and papel = 'dono')
    and exists (select 1 from public.assinaturas where restaurante_id = v_novo and status = 'teste'),
    'super admin: cria restaurante com dono e teste grátis');
  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  v_falhou := false;
  begin perform public.admin_criar_restaurante(md5('caixa.brasa@exemplo.com')::uuid, 'Outro', 'admin', 'Fulano', null, null); exception when others then v_falhou := sqlerrm like '%reservado%'; end;
  perform pg_temp.ok(v_falhou, 'super admin: endereço reservado é recusado');
  perform pg_temp.admin();
  perform pg_temp.ok((select count(*) from rest_privado.admin_registros where acao in ('modulos', 'membro_alterado', 'restaurante_criado')) >= 3,
    'super admin: tudo registrado');
end;
$$;

-- ======================================================================
-- Pagamento por item: o que foi pago não volta para a próxima pessoa
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_mesa uuid;
  v_comanda uuid;
  v_r jsonb;
  v_pedido uuid;
  v_refri uuid;
  v_espeto uuid;
  v_pag uuid;
  v_outro uuid;
  v_falhou boolean;
begin
  perform pg_temp.admin();
  -- Os testes anteriores mudam o plano e a equipe da Brasa: volta ao teste grátis (tudo liberado).
  update public.assinaturas set status = 'teste', teste_termina_em = now() + interval '7 days',
    modulos_liberados = '{}', modulos_bloqueados = '{}' where restaurante_id = a;
  select m.id into v_mesa from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  order by m.numero limit 1;
  select i.id into v_outro from public.itens_pedido i join public.pedidos p on p.id = i.pedido_id
  where i.restaurante_id = a and p.comanda_id is not null and i.cancelado_em is null limit 1;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.comandas (restaurante_id, mesa_id, pessoas) values (a, v_mesa, 2) returning id into v_comanda;
  v_r := public.lancar_itens_comanda(v_comanda, jsonb_build_array(
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Refrigerante lata'), 'quantidade', 2),
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Espeto de carne'), 'quantidade', 1)
  ));
  v_pedido := (v_r ->> 'pedido_id')::uuid;
  select id into v_refri from public.itens_pedido where pedido_id = v_pedido and nome_produto = 'Refrigerante lata';
  select id into v_espeto from public.itens_pedido where pedido_id = v_pedido and nome_produto = 'Espeto de carne';

  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma, itens)
  values (a, v_comanda, 100, 'pix', jsonb_build_array(
    jsonb_build_object('item_id', v_refri, 'quantidade', 1), jsonb_build_object('item_id', v_refri, 'quantidade', 1)))
  returning id into v_pag;
  perform pg_temp.ok((select itens = jsonb_build_array(jsonb_build_object('item_id', v_refri, 'quantidade', 2)) from public.pagamentos where id = v_pag),
    'pagamento por item: guarda os itens pagos (somados por item)');

  v_falhou := false;
  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma, itens)
    values (a, v_comanda, 100, 'pix', jsonb_build_array(jsonb_build_object('item_id', v_refri, 'quantidade', 1)));
  exception when others then v_falhou := sqlerrm like '%já foi pago%'; end;
  perform pg_temp.ok(v_falhou, 'pagamento por item: item já pago não é cobrado de novo');

  v_falhou := false;
  begin
    insert into public.pagamentos (restaurante_id, comanda_id, valor, forma, itens)
    values (a, v_comanda, 100, 'pix', jsonb_build_array(jsonb_build_object('item_id', v_espeto, 'quantidade', 2)));
  exception when others then v_falhou := sqlerrm like '%já foi pago%'; end;
  perform pg_temp.ok(v_falhou, 'pagamento por item: não passa da quantidade lançada');

  v_falhou := v_outro is null;
  if not v_falhou then
    begin
      insert into public.pagamentos (restaurante_id, comanda_id, valor, forma, itens)
      values (a, v_comanda, 100, 'pix', jsonb_build_array(jsonb_build_object('item_id', v_outro, 'quantidade', 1)));
    exception when others then v_falhou := sqlerrm like '%já foi pago%'; end;
  end if;
  perform pg_temp.ok(v_falhou, 'pagamento por item: item de outra mesa é recusado');

  update public.pagamentos set itens = '[]' where id = v_pag;
  perform pg_temp.ok((select jsonb_array_length(itens) = 1 from public.pagamentos where id = v_pag), 'pagamento por item: itens não mudam depois');

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  update public.pagamentos set estornado_em = now(), motivo_estorno = 'cobrado errado' where id = v_pag;
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma, itens)
  values (a, v_comanda, 100, 'pix', jsonb_build_array(jsonb_build_object('item_id', v_refri, 'quantidade', 2)));
  perform pg_temp.ok(true, 'pagamento por item: estorno libera os itens');
end;
$$;

-- ======================================================================
-- Via do cliente ao fechar a mesa
-- ======================================================================
do $$
declare
  a constant uuid := md5('brasa-espetinhos')::uuid;
  v_mesa uuid;
  v_comanda uuid;
  v_imp uuid;
  v_total integer;
begin
  perform pg_temp.admin();
  update public.assinaturas set status = 'teste', teste_termina_em = now() + interval '7 days',
    modulos_liberados = '{}', modulos_bloqueados = '{}' where restaurante_id = a;
  select m.id into v_mesa from public.mesas m
  where m.restaurante_id = a and m.ativa
    and not exists (select 1 from public.comandas c where c.mesa_id = m.id and c.status in ('aberta', 'conta_pedida'))
  order by m.numero limit 1;

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  insert into public.impressoras (restaurante_id, nome, conexao, endereco, porta, largura, codificacao, imprime_ao_fechar)
  values (a, 'Via do cliente', 'rede', '192.168.0.99', 9100, 80, 'cp850', true) returning id into v_imp;
  insert into public.comandas (restaurante_id, mesa_id, pessoas) values (a, v_mesa, 1) returning id into v_comanda;
  perform public.lancar_itens_comanda(v_comanda, jsonb_build_array(
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Refrigerante lata'), 'quantidade', 1)));
  select total into v_total from public.comandas where id = v_comanda;
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda, v_total, 'pix');
  perform pg_temp.ok(not exists (select 1 from public.fila_impressao where comanda_id = v_comanda and tipo = 'conta'),
    'via ao fechar: nada sai antes de fechar');
  update public.comandas set status = 'fechada' where id = v_comanda;
  perform pg_temp.ok((select count(*) = 1 from public.fila_impressao where comanda_id = v_comanda and tipo = 'conta' and impressora_id = v_imp),
    'via ao fechar: fechar a mesa manda a conta para a impressora marcada');

  update public.impressoras set imprime_ao_fechar = false where id = v_imp;
  insert into public.comandas (restaurante_id, mesa_id, pessoas) values (a, v_mesa, 1) returning id into v_comanda;
  perform public.lancar_itens_comanda(v_comanda, jsonb_build_array(
    jsonb_build_object('produto_id', (select id from public.produtos where restaurante_id = a and nome = 'Refrigerante lata'), 'quantidade', 1)));
  select total into v_total from public.comandas where id = v_comanda;
  insert into public.pagamentos (restaurante_id, comanda_id, valor, forma) values (a, v_comanda, v_total, 'pix');
  update public.comandas set status = 'fechada' where id = v_comanda;
  perform pg_temp.ok(not exists (select 1 from public.fila_impressao where comanda_id = v_comanda),
    'via ao fechar: desligada, fechar não imprime');
end;
$$;

-- ======================================================================
-- Meu perfil: cada um muda só o próprio nome, telefone e foto
-- ======================================================================
do $$
declare
  v_uid uuid := md5('garcom2.brasa@exemplo.com')::uuid;
  v_falhou boolean;
begin
  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  perform public.atualizar_meu_perfil('  Zé   Garçom ', '(69) 99999-1234',
    'http://x/storage/v1/object/public/rest-avatares/' || v_uid || '/foto.webp');
  perform pg_temp.admin();
  perform pg_temp.ok((select bool_and(nome = 'Zé Garçom' and telefone = '69999991234' and foto_url like '%/rest-avatares/' || v_uid || '/foto.webp')
    from public.membros where user_id = v_uid), 'perfil: a pessoa muda nome, telefone e foto (em todos os restaurantes dela)');
  perform pg_temp.ok(not exists (select 1 from public.membros where user_id <> v_uid and nome = 'Zé Garçom'), 'perfil: não mexe em mais ninguém');

  perform pg_temp.entrar('garcom2.brasa@exemplo.com');
  v_falhou := false;
  begin perform public.atualizar_meu_perfil('Zé', null, 'http://x/storage/v1/object/public/rest-avatares/' || md5('dono.brasa@exemplo.com')::uuid || '/f.webp');
  exception when others then v_falhou := sqlerrm like 'Foto inválida%'; end;
  perform pg_temp.ok(v_falhou, 'perfil: foto da pasta de outra pessoa é recusada');
  v_falhou := false;
  begin perform public.atualizar_meu_perfil('Zé', '123', null); exception when others then v_falhou := sqlerrm like 'Telefone inválido%'; end;
  perform pg_temp.ok(v_falhou, 'perfil: telefone sem DDD é recusado');
  v_falhou := false;
  begin update public.membros set telefone = '69999990000' where user_id = v_uid; exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'perfil: telefone só muda pela função (não direto na tabela)');

  perform pg_temp.anonimo();
  v_falhou := false;
  begin perform public.atualizar_meu_perfil('X', null, null); exception when others then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'perfil: sem login não muda nada');
end;
$$;

-- ======================================================================
-- Bloqueio de senha errada (só o servidor usa)
-- ======================================================================
do $$
declare
  v_falhou boolean;
  v_espera integer;
begin
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  v_falhou := false;
  begin perform public.login_resultado(array['conta:a@b'], false); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'bloqueio: usuário logado não mexe no contador');
  perform pg_temp.anonimo();
  v_falhou := false;
  begin perform public.login_espera(array['conta:a@b']); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'bloqueio: anônimo não consulta o contador');

  perform pg_temp.admin();
  perform set_config('role', 'service_role', true);
  for i in 1..4 loop perform public.login_resultado(array['conta:teste@x', 'ip:10.0.0.9'], false); end loop;
  perform pg_temp.ok(public.login_espera(array['conta:teste@x']) = 0, 'bloqueio: 4 erros ainda deixam tentar');
  v_espera := public.login_resultado(array['conta:teste@x', 'ip:10.0.0.9'], false);
  perform pg_temp.ok(v_espera between 890 and 900, 'bloqueio: 5º erro trava a conta por 15 min');
  perform pg_temp.ok(public.login_espera(array['conta:outra@x']) = 0, 'bloqueio: outra conta continua livre');
  perform public.login_resultado(array['conta:teste@x', 'ip:10.0.0.9'], true);
  perform pg_temp.ok(public.login_espera(array['conta:teste@x']) = 0, 'bloqueio: acerto zera a conta');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Super admin em duas etapas (senha + código por e-mail)
-- ======================================================================
do $$
declare
  v_admin constant uuid := md5('admin.plataforma@exemplo.com')::uuid;
  v_falhou boolean;
begin
  perform pg_temp.admin();
  delete from rest_privado.admin_sessoes where user_id = v_admin;

  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  perform pg_temp.ok(public.admin_sou_admin() and not public.admin_sessao_verificada(), '2 etapas: só com a senha ainda não está verificado');
  v_falhou := false;
  begin perform public.admin_financeiro(); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, '2 etapas: só com a senha as funções de admin recusam');
  v_falhou := false;
  begin perform public.admin_guardar_codigo(v_admin, repeat('a', 64)); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, '2 etapas: a sessão não consegue criar o próprio código');

  perform pg_temp.admin();
  perform set_config('role', 'service_role', true);
  perform public.admin_guardar_codigo(v_admin, encode(extensions.digest('123456', 'sha256'), 'hex'));
  perform pg_temp.admin();

  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  perform pg_temp.ok(not public.admin_confirmar_codigo('654321'), '2 etapas: código errado não entra');
  perform pg_temp.ok(public.admin_confirmar_codigo('123 456'), '2 etapas: código certo confirma a sessão');
  perform pg_temp.ok(public.admin_sessao_verificada(), '2 etapas: a sessão passa a valer como admin');
  perform pg_temp.ok((select (public.admin_financeiro()) is not null), '2 etapas: funções de admin liberadas');
  v_falhou := false;
  begin perform public.admin_confirmar_codigo('123456'); exception when others then v_falhou := sqlerrm like '%venceu%'; end;
  perform pg_temp.ok(v_falhou, '2 etapas: o código só vale uma vez');

  -- Outra sessão do mesmo admin (outro aparelho) precisa do próprio código.
  perform pg_temp.admin();
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', gen_random_uuid())::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.ok(not public.admin_sessao_verificada(), '2 etapas: outro aparelho precisa do código');

  perform pg_temp.admin();
  perform set_config('role', 'service_role', true);
  perform public.admin_guardar_codigo(v_admin, encode(extensions.digest('111111', 'sha256'), 'hex'));
  perform pg_temp.admin();
  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  for i in 1..5 loop perform public.admin_confirmar_codigo('000000'); end loop;
  v_falhou := false;
  begin perform public.admin_confirmar_codigo('111111'); exception when others then v_falhou := sqlerrm like '%Muitas tentativas%'; end;
  perform pg_temp.ok(v_falhou, '2 etapas: 5 erros invalidam o código');

  perform pg_temp.entrar('dono.brasa@exemplo.com');
  v_falhou := false;
  begin perform public.admin_confirmar_codigo('111111'); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, '2 etapas: quem não é admin não usa');
  perform pg_temp.admin();
end;
$$;

-- ======================================================================
-- Super admin: lembrar deste computador por 30 dias
-- ======================================================================
do $$
declare
  v_admin constant uuid := md5('admin.plataforma@exemplo.com')::uuid;
  v_hash constant text := encode(extensions.digest('chave-do-computador', 'sha256'), 'hex');
  v_falhou boolean;
begin
  perform pg_temp.admin();
  delete from rest_privado.admin_sessoes where user_id = v_admin;
  delete from rest_privado.admin_aparelhos where user_id = v_admin;

  -- Só com a senha não dá para lembrar o computador (senão pularia o código).
  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  v_falhou := false;
  begin perform public.admin_lembrar_aparelho(v_hash, 'Chrome no Windows'); exception when insufficient_privilege then v_falhou := true; end;
  perform pg_temp.ok(v_falhou, 'lembrar: só depois do código');

  -- Sessão confirmada pelo código lembra o computador.
  perform pg_temp.admin();
  insert into rest_privado.admin_sessoes (session_id, user_id, expira_em)
  values (md5('admin.plataforma@exemplo.com:sessao')::uuid, v_admin, now() + interval '1 hour');
  perform pg_temp.entrar('admin.plataforma@exemplo.com');
  perform public.admin_lembrar_aparelho(v_hash, 'Chrome no Windows');

  -- Outra sessão (login novo) neste computador: entra sem código; com outra chave, não.
  perform pg_temp.admin();
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', '11111111-1111-1111-1111-111111111111')::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.ok(not public.admin_entrar_por_aparelho(encode(extensions.digest('outra', 'sha256'), 'hex')), 'lembrar: chave de outro computador não vale');
  perform pg_temp.ok(not public.admin_sessao_verificada(), 'lembrar: sem a chave certa segue pedindo o código');
  perform pg_temp.ok(public.admin_entrar_por_aparelho(v_hash), 'lembrar: computador lembrado entra sem código');
  perform pg_temp.ok(public.admin_sessao_verificada(), 'lembrar: a sessão nova fica confirmada');

  -- Outro admin não usa a chave deste.
  perform pg_temp.entrar('dono.brasa@exemplo.com');
  perform pg_temp.ok(not public.admin_entrar_por_aparelho(v_hash), 'lembrar: quem não é admin não usa');

  perform pg_temp.admin();
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'session_id', '11111111-1111-1111-1111-111111111111')::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.ok(public.admin_esquecer_aparelhos() = 1, 'lembrar: esquecer apaga os computadores');
  perform pg_temp.admin();
  perform pg_temp.ok(not exists (select 1 from rest_privado.admin_aparelhos where user_id = v_admin), 'lembrar: nenhum lembrado depois de esquecer');
end;
$$;

select n, ok, teste from resultado order by n;
select count(*) filter (where not ok) as falhas, count(*) as total from resultado;

rollback;
