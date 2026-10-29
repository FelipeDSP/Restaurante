import "server-only";

import { cookies } from "next/headers";

// "Entrar como" do super admin: o painel mostra a faixa "Modo suporte" enquanto este cookie existir.
// Só exibe quem está ajudando; não dá permissão nenhuma (a sessão é a do dono, registrada no admin).
export const COOKIE_SUPORTE = "modo_suporte";

export type ModoSuporte = { admin: string; dono: string; restaurante: string };

export async function lerModoSuporte(): Promise<ModoSuporte | null> {
  const valor = (await cookies()).get(COOKIE_SUPORTE)?.value;
  if (!valor) return null;
  try {
    const d = JSON.parse(valor) as Partial<ModoSuporte>;
    return typeof d.admin === "string" && typeof d.dono === "string" && typeof d.restaurante === "string" ? (d as ModoSuporte) : null;
  } catch {
    return null;
  }
}
