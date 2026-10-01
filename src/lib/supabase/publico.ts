import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Cliente anônimo sem cookies: para rotas públicas que não dependem de quem está logado
// (manifest/ícones do PWA, site público). A RLS de `anon` vale normalmente.
export function createPublicClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function buscarRestaurantePublico(restauranteId: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("restaurantes_publicos")
    .select("id, slug, nome, logo_url, cor_primaria, cor_secundaria")
    .eq("id", restauranteId)
    .maybeSingle();
  return data;
}
