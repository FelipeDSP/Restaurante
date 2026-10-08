import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { obterUsuario, obterVinculos } from "@/lib/auth/dal";
import { DIAS_TESTE_GRATIS } from "@/lib/planos";
import { createClient } from "@/lib/supabase/server";
import { dominioDoSite } from "@/lib/url";

import { LinhasVelocidade } from "../_componentes/marca";
import { FormComecar } from "./form-comecar";

export const metadata: Metadata = { title: "Cadastre o seu restaurante" };

// Primeiro passo depois de criar a conta (ou para quem já tem conta e quer mais um restaurante).
export default async function Comecar() {
  const usuario = await obterUsuario();
  if (!usuario) redirect("/login?next=/comecar");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = (data?.claims.user_metadata ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : "");
  const jaTemRestaurante = (await obterVinculos()).length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-6">
        <Link href="/" aria-label="uau foods, página inicial">
          <Image src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} priority className="h-9 w-auto" />
        </Link>
        {jaTemRestaurante ? (
          <Link href="/inicio" className="text-sm font-extrabold text-uau-marrom-claro underline underline-offset-4 hover:text-uau-marrom">
            Voltar ao painel
          </Link>
        ) : null}
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 pt-4 pb-20">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="flex items-center gap-3 text-sm font-extrabold tracking-[0.18em] text-uau-laranja-escuro uppercase">
            <LinhasVelocidade className="h-3 w-7" />
            {jaTemRestaurante ? "Novo restaurante" : "Conta criada · falta pouco"}
          </p>
          <h1 className="text-4xl leading-[1.05] font-black tracking-[-0.02em] text-balance sm:text-5xl">
            Agora, a cara do seu restaurante.
          </h1>
          <p className="text-lg text-uau-marrom-claro">
            Seus {DIAS_TESTE_GRATIS} dias de teste começam quando você criar o restaurante. Dá para mudar tudo depois, menos o
            endereço.
          </p>
        </div>
        <p className="-mt-6 text-sm text-uau-marrom-claro">
          O restaurante fica na conta <strong className="break-all text-uau-marrom">{usuario.email ?? "conectada"}</strong>.{" "}
          <Link href="/cadastro" className="font-extrabold underline underline-offset-4">
            Não é você?
          </Link>
        </p>
        <FormComecar
          dominio={await dominioDoSite()}
          nomeInicial={texto(meta.restaurante)}
          nomeDonoInicial={texto(meta.nome)}
        />
      </main>
    </div>
  );
}
