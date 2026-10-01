import { z } from "zod";

import { publicEnv } from "@/lib/env";

// URL pública de um arquivo do restaurante no bucket; recusa qualquer outro endereço.
export function urlImagemDoRestaurante(bucket: "rest-logos" | "rest-produtos", restauranteId: string) {
  const prefixo = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${restauranteId}/`;
  return z.preprocess(
    (valor) => (valor === "" || valor === undefined ? null : valor),
    z
      .string()
      .refine((url) => url.startsWith(prefixo), "Imagem inválida.")
      .nullable(),
  );
}
