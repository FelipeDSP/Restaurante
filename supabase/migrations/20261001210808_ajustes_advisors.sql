-- Ajustes apontados pelos advisors do Supabase.
--
-- Alertas aceitos (intencionais):
-- - anon/authenticated_security_definer_function_executable em consultar_disponibilidade_delivery,
--   criar_pedido_delivery e consultar_pedido_publico: são as RPCs públicas do delivery e validam tudo por dentro.
-- - rls_enabled_no_policy em inscricoes_salmistas: tabela do outro sistema do projeto temporário.

-- Índices para as FKs de autoria (começando por restaurante_id).
create index caixa_sessoes_restaurante_aberta_por_idx on public.caixa_sessoes (restaurante_id, aberta_por);
create index caixa_sessoes_restaurante_fechada_por_idx on public.caixa_sessoes (restaurante_id, fechada_por);
create index comandas_restaurante_garcom_idx on public.comandas (restaurante_id, garcom_id);
create index comandas_restaurante_fechada_por_idx on public.comandas (restaurante_id, fechada_por);
create index itens_pedido_restaurante_cancelado_por_idx on public.itens_pedido (restaurante_id, cancelado_por);
create index pagamentos_restaurante_registrado_por_idx on public.pagamentos (restaurante_id, registrado_por);
create index pagamentos_restaurante_estornado_por_idx on public.pagamentos (restaurante_id, estornado_por);
create index pedidos_restaurante_bairro_idx on public.pedidos (restaurante_id, bairro_id);
create index pedidos_restaurante_criado_por_idx on public.pedidos (restaurante_id, criado_por);
create index pedidos_restaurante_cancelado_por_idx on public.pedidos (restaurante_id, cancelado_por);

-- Uma única policy de SELECT por papel: anon vê o público; authenticated vê o público ou o que é do seu restaurante.

drop policy "membros leem o proprio restaurante" on public.restaurantes;
drop policy "publico le restaurantes ativos" on public.restaurantes;
create policy "publico le restaurantes ativos" on public.restaurantes
  for select to anon
  using (ativo and excluido_em is null);
create policy "usuarios leem restaurantes ativos ou o proprio" on public.restaurantes
  for select to authenticated
  using ((ativo and excluido_em is null) or (select rest_privado.eh_membro(id)));

drop policy "membros leem categorias" on public.categorias;
drop policy "publico le categorias ativas" on public.categorias;
create policy "publico le categorias ativas" on public.categorias
  for select to anon
  using (ativa and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "usuarios leem categorias ativas ou do proprio restaurante" on public.categorias
  for select to authenticated
  using (
    (ativa and (select rest_privado.restaurante_publico(restaurante_id)))
    or (select rest_privado.eh_membro(restaurante_id))
  );

drop policy "membros leem produtos" on public.produtos;
drop policy "publico le produtos do delivery" on public.produtos;
create policy "publico le produtos do delivery" on public.produtos
  for select to anon
  using (disponivel and disponivel_delivery and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "usuarios leem produtos do delivery ou do proprio restaurante" on public.produtos
  for select to authenticated
  using (
    (disponivel and disponivel_delivery and (select rest_privado.restaurante_publico(restaurante_id)))
    or (select rest_privado.eh_membro(restaurante_id))
  );

drop policy "membros leem bairros" on public.bairros_entrega;
drop policy "publico le bairros ativos" on public.bairros_entrega;
create policy "publico le bairros ativos" on public.bairros_entrega
  for select to anon
  using (ativo and (select rest_privado.restaurante_publico(restaurante_id)));
create policy "usuarios leem bairros ativos ou do proprio restaurante" on public.bairros_entrega
  for select to authenticated
  using (
    (ativo and (select rest_privado.restaurante_publico(restaurante_id)))
    or (select rest_privado.eh_membro(restaurante_id))
  );
