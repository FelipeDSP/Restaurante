"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

import { COOKIE_SUPORTE, COOKIE_VOLTA_SUPORTE } from "./suporte";

// Sai do modo suporte: encerra a sessão do dono só neste navegador (o dono continua logado nos
// aparelhos dele) e volta para a ficha do restaurante com a sessão do admin guardada ao entrar.
// Sem ela (venceu ou não existe), volta para a entrada do admin.
//
// Fica aqui, e não no painel da plataforma, porque quem chama é a faixa "Modo suporte" do painel
// do restaurante — que não tem nada a ver com as telas de /admin.
export async function sairDoSuporte(): Promise<void> {
  const supabase = await createClient();
  const c = await cookies();
  let volta: { token?: unknown; restauranteId?: unknown } = {};
  try {
    volta = JSON.parse(c.get(COOKIE_VOLTA_SUPORTE)?.value ?? "{}");
  } catch {
    volta = {};
  }
  c.delete(COOKIE_SUPORTE);
  c.delete(COOKIE_VOLTA_SUPORTE);
  await supabase.auth.signOut({ scope: "local" });

  if (typeof volta.token === "string") {
    const { error } = await supabase.auth.refreshSession({ refresh_token: volta.token });
    const { data: ehAdmin } = error ? { data: false } : await supabase.rpc("admin_sou_admin");
    if (!error && ehAdmin) {
      const restaurante = typeof volta.restauranteId === "string" && id.safeParse(volta.restauranteId).success ? volta.restauranteId : null;
      redirect(restaurante ? `/admin/restaurantes/${restaurante}` : "/admin");
    }
    if (!error) await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/admin/entrar");
}
