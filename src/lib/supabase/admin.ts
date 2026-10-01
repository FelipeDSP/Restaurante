import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Cliente com a chave secreta: ignora RLS. Usar só depois de checar permissão no servidor
// e só para o que o usuário não consegue fazer com a própria sessão (ex.: criar contas).
// Retorna null se a chave não estiver configurada.
export function createAdminClient() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) return null;

  return createSupabaseClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
