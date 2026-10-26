import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { NOME_STATUS_MESA } from "@/lib/rotulos";
import { tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { caixaEstaAberto, carregarMapa, type MesaNoMapa } from "../../garcom/dados";

export const metadata: Metadata = { title: "Mesas" };

// Mapa de mesas do painel: o mesmo do app do garçom, largo e com o que o caixa precisa ver
// (garçom, tempo, total e quanto falta). Tocar abre a mesa (livre: abrir; ocupada: a comanda).
function CartaoMesa({ mesa }: { mesa: MesaNoMapa }) {
  const falta = Math.max(0, mesa.total - mesa.pago);
  return (
    <Link
      href={`/painel/comandas/${mesa.id}`}
      aria-label={`Mesa ${mesa.numero}: ${NOME_STATUS_MESA[mesa.status]}${mesa.pedidosProntos > 0 ? ", prato pronto para servir" : ""}`}
      className={cn(
        "relative flex min-h-32 flex-col gap-2 rounded-xl border-2 p-3 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        mesa.status === "livre" && "border-dashed border-border bg-background text-muted-foreground hover:border-solid hover:bg-muted/40",
        mesa.status === "aberta" && "border-[var(--cor-primaria)] bg-background hover:bg-muted/40",
        mesa.status === "conta_pedida" && "border-amber-500 bg-amber-50 hover:bg-amber-100",
      )}
    >
      {mesa.pedidosProntos > 0 ? (
        <span className="absolute -top-2 -right-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white shadow ring-2 ring-background">
          Pronto
        </span>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <span className={cn("leading-tight font-bold break-words text-foreground", mesa.numero.length > 3 ? "text-lg" : "text-2xl leading-none")}>
          {mesa.numero}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            mesa.status === "aberta" && "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]",
            mesa.status === "conta_pedida" && "bg-amber-300 text-amber-950",
            mesa.status === "livre" && "bg-muted",
          )}
        >
          {NOME_STATUS_MESA[mesa.status]}
        </span>
      </div>
      {mesa.status !== "livre" ? (
        <div className="mt-auto flex flex-col gap-0.5 text-sm">
          <span className="truncate text-muted-foreground">
            {mesa.garcom ?? "—"}
            {mesa.abertaEm ? ` · ${tempoDesde(mesa.abertaEm)}` : ""}
          </span>
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold tabular-nums">{formatarBRL(mesa.total)}</span>
            {mesa.pago > 0 ? <span className="text-xs tabular-nums text-muted-foreground">falta {formatarBRL(falta)}</span> : null}
          </span>
        </div>
      ) : null}
    </Link>
  );
}

export default async function MesasPainelPage() {
  const acesso = await exigirPermissao("painel", "comandas_painel", "garcom_app");
  const [mesas, caixaAberto] = await Promise.all([carregarMapa(acesso.restaurante.id), caixaEstaAberto(acesso.restaurante.id)]);
  const ocupadas = mesas.filter((m) => m.status !== "livre");
  const aReceber = ocupadas.reduce((soma, m) => soma + Math.max(0, m.total - m.pago), 0);
  const contaPedida = ocupadas.filter((m) => m.status === "conta_pedida").length;

  return (
    <main className="flex flex-col gap-5 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas", "pagamentos", "tarefas_producao", "caixa_sessoes"]} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Mesas</h1>
          <p className="text-sm text-muted-foreground">
            {ocupadas.length} de {mesas.length} ocupadas
            {contaPedida > 0 ? ` · ${contaPedida} com conta pedida` : ""} · {formatarBRL(aReceber)} a receber
          </p>
        </div>
        {!caixaAberto ? (
          acesso.permissoes.includes("caixa_operar") ? (
            <Link href="/painel/caixa" className="text-sm font-medium text-destructive underline">
              Caixa fechado: abrir caixa
            </Link>
          ) : (
            <p className="text-sm font-medium text-destructive">Caixa fechado</p>
          )
        ) : null}
      </div>

      {mesas.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhuma mesa cadastrada.{" "}
          {acesso.permissoes.includes("mesas") ? (
            <Link href="/painel/mesas" className="font-medium text-foreground underline underline-offset-4">
              Cadastrar mesas
            </Link>
          ) : null}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {mesas.map((mesa) => (
            <li key={mesa.id}>
              <CartaoMesa mesa={mesa} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
