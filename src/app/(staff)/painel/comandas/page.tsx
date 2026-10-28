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

// Mapa de mesas (o app de toda a equipe): 3 por linha no celular, mais no computador. Ocupada fica
// na cor do restaurante e conta pedida em amarelo, para achar de longe; tocar abre a mesa.
function CartaoMesa({ mesa }: { mesa: MesaNoMapa }) {
  const falta = Math.max(0, mesa.total - mesa.pago);
  return (
    <Link
      href={`/painel/comandas/${mesa.id}`}
      aria-label={`Mesa ${mesa.numero}: ${NOME_STATUS_MESA[mesa.status]}${mesa.pedidosProntos > 0 ? ", prato pronto para servir" : ""}`}
      className={cn(
        "relative flex min-h-28 flex-col justify-between gap-2 rounded-xl border-2 p-3 transition-transform active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-32",
        mesa.status === "livre" && "border-dashed border-border bg-background text-muted-foreground hover:border-solid hover:bg-muted/40",
        mesa.status === "aberta" && "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]",
        mesa.status === "conta_pedida" && "border-amber-500 bg-amber-300 text-amber-950",
      )}
    >
      {mesa.pedidosProntos > 0 ? (
        <span className="absolute -top-2 -right-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white shadow ring-2 ring-background">
          Pronto
        </span>
      ) : null}
      {/* Nomes longos ("Varanda 1") em fonte menor para não quebrar no meio da palavra. */}
      <span className={cn("leading-tight font-bold break-words", mesa.status === "livre" && "text-foreground", mesa.numero.length > 3 ? "text-base sm:text-lg" : "text-2xl leading-none")}>
        {mesa.numero}
      </span>
      <span className="flex flex-col gap-0.5 text-xs leading-tight sm:text-sm">
        <span className="font-semibold">{NOME_STATUS_MESA[mesa.status]}</span>
        {mesa.status !== "livre" ? (
          <>
            <span className="font-semibold tabular-nums">{formatarBRL(mesa.total)}</span>
            {mesa.pago > 0 ? <span className="tabular-nums opacity-80">falta {formatarBRL(falta)}</span> : null}
            <span className="truncate opacity-80">
              {mesa.abertaEm ? tempoDesde(mesa.abertaEm) : ""}
              <span className="hidden sm:inline">{mesa.garcom ? ` · ${mesa.garcom}` : ""}</span>
            </span>
            {/* Mesa aberta pelo cliente (QR code): ninguém assumiu ainda. */}
            {mesa.garcom ? null : <span className="font-semibold">Sem garçom</span>}
          </>
        ) : null}
      </span>
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
          {/* Com a aba Praças, o título já está nas abas (Mesas | Praças). */}
          <h1 className={acesso.permissoes.includes("garcom_app") ? "sr-only" : "text-2xl font-semibold"}>Mesas</h1>
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
        <ul className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-5">
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
