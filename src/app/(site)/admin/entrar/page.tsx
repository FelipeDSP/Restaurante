import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { entrarPeloAparelho } from "../aparelho";
import { FormCodigoAdmin, FormEntrarAdmin } from "./form-entrar";

export const metadata: Metadata = { title: { absolute: "Entrar · Plataforma · uau foods" }, robots: { index: false } };

// Entrada própria do painel da plataforma (separada do login das equipes dos restaurantes).
export default async function EntrarAdminPage(props: PageProps<"/admin/entrar">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  // Admin logado: com o código confirmado vai para o painel; senão, mostra a etapa do código.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  let pendente: string | null = null;
  if (data?.claims?.sub) {
    const { data: admin } = await supabase.rpc("admin_sou_admin");
    if (admin) {
      const { data: verificada } = await supabase.rpc("admin_sessao_verificada");
      if (verificada || (await entrarPeloAparelho(supabase))) redirect("/admin");
      pendente = typeof data.claims.email === "string" ? data.claims.email : "";
    }
  }

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-uau-marrom px-4 py-10 text-uau-creme">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/marca/uau-foods-branca.png" alt="uau foods" width={1024} height={351} className="h-10 w-auto" priority />
          <span className="rounded-full border border-uau-laranja/40 px-3 py-0.5 text-xs font-black tracking-[0.2em] text-uau-laranja uppercase">
            Plataforma
          </span>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
          <h1 className="mb-5 text-xl font-black">{pendente !== null ? "Código de acesso" : "Entrar no painel"}</h1>
          {pendente !== null ? <FormCodigoAdmin email={pendente} next={next} /> : <FormEntrarAdmin next={next} />}
        </div>
        <p className="text-center text-xs text-uau-creme/40">Acesso restrito à equipe da plataforma.</p>
      </div>
    </main>
  );
}
