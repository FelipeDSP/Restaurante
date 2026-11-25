-- Conversa do delivery: calcular a permissão uma vez por consulta, não linha a linha.
--
-- A política era `(select rest_privado.tem_permissao(restaurante_id, array['delivery']))`.
-- Como a chamada referencia a coluna da própria linha, o Postgres não consegue elevá-la a
-- um InitPlan e avalia a cadeia de permissão (membros -> função -> plano -> suspensão) para
-- cada linha lida. Medido: 3 linhas em 22 ms, 203 linhas em 1.151 ms (~5,6 ms por linha).
-- Como `contarMensagensNaoLidas` roda no layout do painel, toda tela de quem tem a permissão
-- `delivery` pagava isso a cada render e a cada evento do tempo real: a tela de Início do dono
-- ia de 89 ms para 2.312 ms com 203 mensagens sem ler, e piorava em linha reta.
--
-- A permissão passa a ser um conjunto de restaurantes, calculado uma vez porque a subconsulta
-- não referencia a linha. A regra é a mesma, item por item: continua exigindo membro do
-- restaurante da linha, ativo, restaurante não excluído e permissão `delivery` depois do
-- plano e da suspensão (é a mesma `permissoes_membro`). Nada foi afrouxado:
-- `restaurante_id in (conjunto)` é verdadeiro exatamente quando `tem_permissao` era.

-- Os restaurantes em que o usuário de agora tem alguma das permissões pedidas.
-- Mesmas condições de rest_privado.tem_permissao, só sem receber o restaurante como parâmetro.
create function rest_privado.restaurantes_com_permissao(p_permissoes text[])
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.restaurante_id
  from public.membros m
  join public.restaurantes r on r.id = m.restaurante_id
  where m.user_id = (select auth.uid())
    and m.ativo
    and r.excluido_em is null
    and rest_privado.permissoes_membro(m.id) && p_permissoes;
$$;
revoke all on function rest_privado.restaurantes_com_permissao(text[]) from public, anon;
grant execute on function rest_privado.restaurantes_com_permissao(text[]) to authenticated;

-- A tabela continua sem grant para anon e sem política de escrita: só select, só authenticated,
-- e escrever segue apenas pelas RPCs cliente_enviar_mensagem / equipe_enviar_mensagem.
drop policy "equipe do delivery le as conversas" on public.pedidos_mensagens;
create policy "equipe do delivery le as conversas" on public.pedidos_mensagens
  for select to authenticated
  using (restaurante_id in (select r from rest_privado.restaurantes_com_permissao(array['delivery']) r));
