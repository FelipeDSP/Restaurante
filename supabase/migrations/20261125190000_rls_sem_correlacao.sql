-- Políticas de leitura sem correlação por linha (o mesmo da migração conversa_rls_por_consulta,
-- agora no esquema inteiro).
--
-- `(select rest_privado.eh_membro(tabela.restaurante_id))` referencia a coluna da própria linha,
-- então o Postgres não consegue elevar a chamada a um InitPlan e avalia a cadeia de permissão
-- linha a linha. Com `eh_membro` o custo por linha é baixo (~0,05 ms), mas cresce em linha reta, e
-- as telas se refazem em tempo real.
--
-- A permissão vira um conjunto de restaurantes, calculado UMA vez por consulta porque a
-- subconsulta não referencia a linha. A regra é a mesma, item por item: as funções novas têm
-- exatamente as condições das antigas (membro do restaurante, ativo, restaurante não excluído e o
-- papel/permissão pedido). `restaurante_id IN (conjunto)` é verdadeiro exatamente quando
-- `eh_membro(restaurante_id)` era.
--
-- Só o `using` muda. O `with_check` roda uma vez por linha gravada, então não paga custo por
-- linha, e mexer nele seria risco sem ganho. As políticas do catálogo público
-- (`restaurante_publico`) e as do cliente (`auth.uid()`, EXISTS) ficam como estão.

-- Os restaurantes em que o usuário de agora é membro ativo. Mesmas condições de
-- rest_privado.eh_membro, sem receber o restaurante como parâmetro.
create function rest_privado.meus_restaurantes()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.restaurante_id
  from public.membros m
  join public.restaurantes r on r.id = m.restaurante_id
  where m.user_id = (select auth.uid())
    and m.ativo
    and r.excluido_em is null;
$$;
revoke all on function rest_privado.meus_restaurantes() from public, anon;
grant execute on function rest_privado.meus_restaurantes() to authenticated;

-- Idem para rest_privado.tem_papel.
create function rest_privado.restaurantes_com_papel(p_papeis text[])
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.restaurante_id
  from public.membros m
  join public.restaurantes r on r.id = m.restaurante_id
  where m.user_id = (select auth.uid())
    and m.ativo
    and m.papel = any (p_papeis)
    and r.excluido_em is null;
$$;
revoke all on function rest_privado.restaurantes_com_papel(text[]) from public, anon;
grant execute on function rest_privado.restaurantes_com_papel(text[]) to authenticated;

-- adicionais
alter policy "dono apaga adicionais" on public.adicionais
  using ((adicionais.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "dono edita adicionais" on public.adicionais
  using ((adicionais.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "usuarios leem adicionais disponiveis ou do proprio restaurante" on public.adicionais
  using (((disponivel AND ( SELECT rest_privado.restaurante_publico(adicionais.restaurante_id) AS restaurante_publico)) OR (adicionais.restaurante_id IN ( SELECT rest_privado.meus_restaurantes()))));

-- agentes_impressao
alter policy "dono e caixa veem computadores" on public.agentes_impressao
  using ((agentes_impressao.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['caixa_operar'::text, 'impressao'::text]))));
alter policy "dono edita computadores" on public.agentes_impressao
  using ((agentes_impressao.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['impressao'::text]))));
alter policy "dono exclui computadores" on public.agentes_impressao
  using ((agentes_impressao.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['impressao'::text]))));

-- assinaturas
alter policy "dono le a assinatura" on public.assinaturas
  using ((assinaturas.restaurante_id IN ( SELECT rest_privado.restaurantes_com_papel(ARRAY['dono'::text]))));

-- bairros_entrega
alter policy "dono apaga bairros" on public.bairros_entrega
  using ((bairros_entrega.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['restaurante'::text]))));
alter policy "dono edita bairros" on public.bairros_entrega
  using ((bairros_entrega.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['restaurante'::text]))));
alter policy "usuarios leem bairros ativos ou do proprio restaurante" on public.bairros_entrega
  using (((ativo AND ( SELECT rest_privado.restaurante_publico(bairros_entrega.restaurante_id) AS restaurante_publico)) OR (bairros_entrega.restaurante_id IN ( SELECT rest_privado.meus_restaurantes()))));

-- caixa_sessoes
alter policy "caixa e dono fecham o caixa" on public.caixa_sessoes
  using ((caixa_sessoes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['caixa_operar'::text]))));
alter policy "membros leem sessoes de caixa" on public.caixa_sessoes
  using ((caixa_sessoes.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- cardapios
alter policy "cardapios_alterar" on public.cardapios
  using ((cardapios.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "cardapios_apagar" on public.cardapios
  using ((cardapios.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "cardapios_ler" on public.cardapios
  using ((cardapios.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- cardapios_produtos
alter policy "cardapios_produtos_desligar" on public.cardapios_produtos
  using ((cardapios_produtos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "cardapios_produtos_ler" on public.cardapios_produtos
  using ((cardapios_produtos.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- categorias
alter policy "dono apaga categorias" on public.categorias
  using ((categorias.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "dono edita categorias" on public.categorias
  using ((categorias.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "usuarios leem categorias ativas ou do proprio restaurante" on public.categorias
  using (((ativa AND ( SELECT rest_privado.restaurante_publico(categorias.restaurante_id) AS restaurante_publico)) OR (categorias.restaurante_id IN ( SELECT rest_privado.meus_restaurantes()))));

-- chamados_garcom
alter policy "chamados_garcom_ler" on public.chamados_garcom
  using (((chamados_garcom.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['caixa_operar'::text, 'delivery'::text, 'comandas_painel'::text]))) OR (garcom_id IN ( SELECT m.id FROM public.membros m WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND m.ativo)))));

-- clientes
alter policy "cliente lê o próprio cadastro e dono/caixa leem os do restaur" on public.clientes
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (clientes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['delivery'::text])))));

-- comandas
alter policy "membros atualizam comandas" on public.comandas
  using ((comandas.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));
alter policy "membros leem comandas" on public.comandas
  using ((comandas.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- cupons
alter policy "cupons_dono_altera" on public.cupons
  using ((cupons.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cupons'::text]))));
alter policy "cupons_dono_le" on public.cupons
  using ((cupons.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['delivery'::text, 'cupons'::text]))));

-- entregadores
alter policy "entregadores_alterar" on public.entregadores
  using ((entregadores.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['entregadores'::text]))));
alter policy "entregadores_ler" on public.entregadores
  using ((entregadores.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['delivery'::text, 'entregadores'::text]))));

-- estacoes
alter policy "dono apaga pracas" on public.estacoes
  using ((estacoes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['impressao'::text]))));
alter policy "dono edita pracas" on public.estacoes
  using ((estacoes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['impressao'::text]))));
alter policy "membros leem pracas" on public.estacoes
  using ((estacoes.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- estoque_itens
alter policy "estoque_itens_alterar" on public.estoque_itens
  using ((estoque_itens.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));
alter policy "estoque_itens_apagar" on public.estoque_itens
  using ((estoque_itens.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));
alter policy "estoque_itens_ler" on public.estoque_itens
  using ((estoque_itens.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));

-- estoque_movimentos
alter policy "estoque_movimentos_ler" on public.estoque_movimentos
  using ((estoque_movimentos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));

-- fila_impressao
alter policy "dono e caixa veem a fila" on public.fila_impressao
  using ((fila_impressao.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['caixa_operar'::text, 'impressao'::text]))));

-- funcoes
alter policy "funcoes_alterar" on public.funcoes
  using ((funcoes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_papel(ARRAY['dono'::text]))));
alter policy "funcoes_excluir" on public.funcoes
  using ((funcoes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_papel(ARRAY['dono'::text]))));
alter policy "funcoes_ler" on public.funcoes
  using ((funcoes.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- grupos_adicionais
alter policy "dono apaga grupos" on public.grupos_adicionais
  using ((grupos_adicionais.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "dono edita grupos" on public.grupos_adicionais
  using ((grupos_adicionais.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "usuarios leem grupos ativos ou do proprio restaurante" on public.grupos_adicionais
  using (((ativo AND ( SELECT rest_privado.restaurante_publico(grupos_adicionais.restaurante_id) AS restaurante_publico)) OR (grupos_adicionais.restaurante_id IN ( SELECT rest_privado.meus_restaurantes()))));

-- impressoras
alter policy "dono apaga impressoras" on public.impressoras
  using ((impressoras.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['impressao'::text]))));
alter policy "dono e caixa veem impressoras" on public.impressoras
  using ((impressoras.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['caixa_operar'::text, 'impressao'::text]))));
alter policy "dono edita impressoras" on public.impressoras
  using ((impressoras.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['impressao'::text]))));

-- itens_pedido
alter policy "membros editam e cancelam itens" on public.itens_pedido
  using ((itens_pedido.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));
alter policy "membros leem itens" on public.itens_pedido
  using ((itens_pedido.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- membros
alter policy "dono edita membros" on public.membros
  using ((membros.restaurante_id IN ( SELECT rest_privado.restaurantes_com_papel(ARRAY['dono'::text]))));
alter policy "usuario le seus vinculos e membros leem a equipe" on public.membros
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (membros.restaurante_id IN ( SELECT rest_privado.meus_restaurantes()))));

-- mesas
alter policy "dono apaga mesas" on public.mesas
  using ((mesas.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['mesas'::text]))));
alter policy "dono edita mesas" on public.mesas
  using ((mesas.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['mesas'::text]))));
alter policy "membros leem mesas" on public.mesas
  using ((mesas.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- movimentos_caixa
alter policy "membros leem movimentos de caixa" on public.movimentos_caixa
  using ((movimentos_caixa.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- pagamentos
alter policy "caixa e dono estornam pagamentos" on public.pagamentos
  using ((pagamentos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['caixa_estornar'::text]))));
alter policy "membros leem pagamentos" on public.pagamentos
  using ((pagamentos.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- pedidos
alter policy "membros atualizam pedidos" on public.pedidos
  using ((pedidos.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));
alter policy "membros leem pedidos" on public.pedidos
  using ((pedidos.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- pedidos_alteracoes
alter policy "pedidos_alteracoes_ler" on public.pedidos_alteracoes
  using ((pedidos_alteracoes.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['delivery'::text]))));

-- produto_etapas
alter policy "dono apaga etapas" on public.produto_etapas
  using ((produto_etapas.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "dono edita etapas" on public.produto_etapas
  using ((produto_etapas.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "membros leem etapas" on public.produto_etapas
  using ((produto_etapas.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));

-- produto_insumos
alter policy "produto_insumos_alterar" on public.produto_insumos
  using ((produto_insumos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));
alter policy "produto_insumos_apagar" on public.produto_insumos
  using ((produto_insumos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));
alter policy "produto_insumos_ler" on public.produto_insumos
  using ((produto_insumos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['estoque'::text]))));

-- produtos
alter policy "dono apaga produtos" on public.produtos
  using ((produtos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "dono edita produtos" on public.produtos
  using ((produtos.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "usuarios leem produtos do delivery ou do proprio restaurante" on public.produtos
  using (((produtos.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())) OR (disponivel AND disponivel_delivery AND ( SELECT rest_privado.restaurante_publico(produtos.restaurante_id) AS restaurante_publico) AND rest_privado.produto_no_cardapio(restaurante_id, id))));

-- produtos_grupos_adicionais
alter policy "dono desliga grupos de produtos" on public.produtos_grupos_adicionais
  using ((produtos_grupos_adicionais.restaurante_id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['cardapio'::text]))));
alter policy "usuarios leem grupos dos produtos" on public.produtos_grupos_adicionais
  using ((( SELECT rest_privado.restaurante_publico(produtos_grupos_adicionais.restaurante_id) AS restaurante_publico) OR (produtos_grupos_adicionais.restaurante_id IN ( SELECT rest_privado.meus_restaurantes()))));

-- restaurantes
alter policy "dono edita o restaurante" on public.restaurantes
  using ((restaurantes.id IN ( SELECT rest_privado.restaurantes_com_permissao(ARRAY['restaurante'::text]))));
alter policy "usuarios leem restaurantes ativos ou o proprio" on public.restaurantes
  using (((ativo AND (excluido_em IS NULL)) OR (restaurantes.id IN ( SELECT rest_privado.meus_restaurantes()))));

-- tarefas_producao
alter policy "membros leem tarefas" on public.tarefas_producao
  using ((tarefas_producao.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));
alter policy "membros marcam tarefas" on public.tarefas_producao
  using ((tarefas_producao.restaurante_id IN ( SELECT rest_privado.meus_restaurantes())));
