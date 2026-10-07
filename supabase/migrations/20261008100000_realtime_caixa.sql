-- Abrir ou fechar o caixa aparece na hora para o garçom (antes só recarregando a tela).
-- A RLS de leitura de caixa_sessoes (membros) vale também para o Realtime.
alter publication supabase_realtime add table public.caixa_sessoes;
