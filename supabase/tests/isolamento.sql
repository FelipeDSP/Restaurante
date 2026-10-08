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
    json_build_object('sub', md5(p_email)::uuid, 'role', 'authenticated')::text, true);
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
    insert into public.agentes_impressao (restaurante_id, nome, codigo_hash, codigo_expira_em)
    values (a, 'Notebook do caixa', 'hash-do-codigo', now() + interval '10 minutes') returning id into v_agente;
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
  update public.pedidos set cliente_id = (select id from public.clientes where user_id = v_outro and restaurante_id = a)
  where id = v_pedido;
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
    perform pg_temp.ok(sqlerrm like 'Só o dono%', 'relatório: dono de A não vê o relatório de B');
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
    perform pg_temp.ok(sqlerrm like 'Só o dono%', 'relatório: caixa não vê os relatórios');
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

select n, ok, teste from resultado order by n;
select count(*) filter (where not ok) as falhas, count(*) as total from resultado;

rollback;
