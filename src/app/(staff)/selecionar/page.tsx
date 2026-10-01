import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { escolherRestaurante, sair } from "@/lib/auth/actions";
import { obterContexto } from "@/lib/auth/dal";
import { NOME_PAPEL } from "@/lib/auth/papeis";
import { corDeContraste } from "@/lib/cores";

export const metadata: Metadata = { title: "Escolher restaurante" };

export default async function SelecionarPage() {
  const { usuario, vinculos, ativo } = await obterContexto();
  if (!usuario) redirect("/login");
  if (vinculos.length === 0) redirect("/sem-acesso");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 pt-10">
      <h1 className="text-2xl font-semibold">Escolha o restaurante</h1>

      <ul className="flex flex-col gap-3">
        {vinculos.map((v) => (
          <li key={v.membroId}>
            <form action={escolherRestaurante}>
              <input type="hidden" name="restauranteId" value={v.restaurante.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-current={ativo?.restaurante.id === v.restaurante.id ? "true" : undefined}
              >
                <span
                  aria-hidden
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold"
                  style={{
                    backgroundColor: v.restaurante.corPrimaria,
                    color: corDeContraste(v.restaurante.corPrimaria),
                  }}
                >
                  {v.restaurante.nome.charAt(0)}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{v.restaurante.nome}</span>
                  <span className="text-sm text-muted-foreground">{NOME_PAPEL[v.papel]}</span>
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={sair}>
        <Button type="submit" variant="ghost" className="w-full">
          Sair
        </Button>
      </form>
    </main>
  );
}
