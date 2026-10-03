import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { Badge } from "@/components/ui/badge";
import { exigirAcesso } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { caixaEstaAberto } from "../../garcom/dados";

export const metadata: Metadata = { title: "Comandas" };

export default async function ComandasPage() {
  const acesso = await exigirAcesso("painel");
  const supabase = await createClient();

  const [{ data, error }, caixaAberto] = await Promise.all([
    supabase
      .from("comandas")
      .select(
        `id, status, total, aberta_em, pessoas,
         mesa:mesas!comandas_restaurante_id_mesa_id_fkey(id, numero, ordem),
         garcom:membros!comandas_restaurante_id_garcom_id_fkey(nome),
         pagamentos(valor, estornado_em)`,
      )
      .eq("restaurante_id", acesso.restaurante.id)
      .in("status", ["aberta", "conta_pedida"])
      .order("aberta_em"),
    caixaEstaAberto(acesso.restaurante.id),
  ]);
  if (error) throw new Error(error.message);

  const comandas = data
    .map((c) => {
      const pago = c.pagamentos.filter((p) => !p.estornado_em).reduce((soma, p) => soma + p.valor, 0);
      return { ...c, pago, falta: Math.max(0, c.total - pago) };
    })
    // Conta pedida primeiro: é o que o caixa precisa atender agora.
    .sort((a, b) => Number(b.status === "conta_pedida") - Number(a.status === "conta_pedida"));

  const totalEmAberto = comandas.reduce((soma, c) => soma + c.falta, 0);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos"]} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Comandas abertas</h1>
          <p className="text-muted-foreground">
            {comandas.length} {comandas.length === 1 ? "comanda" : "comandas"} · {formatarBRL(totalEmAberto)} a receber
          </p>
        </div>
        {!caixaAberto ? (
          <Link href="/painel/caixa" className="text-sm font-medium text-destructive underline">
            Caixa fechado: abrir caixa
          </Link>
        ) : null}
      </div>

      {comandas.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma comanda aberta no momento.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {comandas.map((c) => (
            <li key={c.id}>
              <Link
                href={`/painel/comandas/${c.mesa?.id}`}
                className={cn(
                  "flex h-full flex-col gap-2 rounded-xl border-2 p-4 transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  c.status === "conta_pedida" ? "border-amber-400 bg-amber-50" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xl font-bold">Mesa {c.mesa?.numero}</span>
                  {c.status === "conta_pedida" ? (
                    <Badge className="bg-amber-300 text-amber-950">Conta pedida</Badge>
                  ) : (
                    <Badge variant="outline">Aberta</Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {c.garcom?.nome ?? "—"} · {tempoDesde(c.aberta_em)}
                  {c.pessoas ? ` · ${c.pessoas} pessoas` : ""}
                </span>
                <div className="mt-auto flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold tabular-nums">{formatarBRL(c.total)}</span>
                  {c.pago > 0 ? (
                    <span className="text-sm tabular-nums text-muted-foreground">falta {formatarBRL(c.falta)}</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
