import "server-only";

import { cookies } from "next/headers";

import { COOKIE_RESTAURANTE } from "@/lib/auth/dal";

// Grava o restaurante ativo. Só chamar com um id já validado contra os vínculos do usuário
// (o dal revalida a cada requisição de qualquer forma).
export async function gravarRestauranteAtivo(restauranteId: string): Promise<void> {
  (await cookies()).set(COOKIE_RESTAURANTE, restauranteId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
