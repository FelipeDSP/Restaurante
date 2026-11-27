import "server-only";

import { createClient } from "@/lib/supabase/server";

// "Clientes pedem pelo celular" está ligado? (mostrado na tela do QR code e no mapa de Mesas)
export async function pedidoPeloQrLigado(restauranteId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("restaurantes").select("pedido_mesa_qr").eq("id", restauranteId).maybeSingle();
  return data?.pedido_mesa_qr ?? false;
}
