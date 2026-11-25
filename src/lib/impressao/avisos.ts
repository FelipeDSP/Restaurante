import "server-only";

import { createClient } from "@/lib/supabase/server";

// Quantos trabalhos de impressão desistiram (impressora fora do ar tempo demais). Vem de uma RPC
// porque a cozinha não tem permissão para ler a fila — e aqui é só uma contagem.
export async function contarImpressoesComErro(restauranteId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("impressoes_com_erro", { p_restaurante_id: restauranteId });
  return data ?? 0;
}
