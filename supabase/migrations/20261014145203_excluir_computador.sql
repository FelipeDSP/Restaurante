-- Excluir um computador pareado (criado por engano ou que não existe mais).
-- Não apaga nenhum registro de pedido: impressoras e fila só perdem o vínculo (on delete set null).
-- Se o app desse computador ainda estiver aberto, a chave dele deixa de valer e ele mostra "desconectado".

create policy "dono exclui computadores" on public.agentes_impressao
  for delete to authenticated
  using ((select rest_privado.tem_papel(restaurante_id, array['dono'])));

grant delete on public.agentes_impressao to authenticated;
