import type { Metadata } from "next";
import Link from "next/link";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { carregarBairros, sugerirBairros } from "./dados";
import { ListaBairros, NovoBairro } from "./lista-bairros";

export const metadata: Metadata = { title: "Bairros de entrega" };

export default async function BairrosPage() {
  const acesso = await exigirPermissao("painel", "restaurante");
  const supabase = await createClient();

  const [bairros, { data: restaurante }] = await Promise.all([
    carregarBairros(acesso.restaurante.id),
    supabase.from("restaurantes").select("taxa_entrega_modo").eq("id", acesso.restaurante.id).maybeSingle(),
  ]);
  const sugestoes = await sugerirBairros(acesso.restaurante.id, bairros);
  const porBairro = restaurante?.taxa_entrega_modo === "bairro";

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="sr-only">Bairros de entrega</h1>
      {/* A lista só vale no modo "taxa por bairro": sem isso, a pessoa cadastra tudo e não
          entende por que o cliente continua pagando o mesmo valor. */}
      {porBairro ? null : (
        <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          A entrega está com <strong>uma taxa só para todo mundo</strong>. Esta lista só vale depois de trocar para taxa por bairro em{" "}
          <Link href="/painel/restaurante#delivery" className="font-semibold underline underline-offset-4">
            Restaurante › Delivery
          </Link>
          .
        </p>
      )}
      <NovoBairro sugestoes={sugestoes} />
      <ListaBairros bairros={bairros} />
    </main>
  );
}
