import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirAcesso } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { AvisoCaixaFechado } from "./aviso-caixa";
import { caixaEstaAberto, carregarMapa, type MesaNoMapa } from "./dados";

const ROTULO_STATUS: Record<MesaNoMapa["status"], string> = {
  livre: "Livre",
  aberta: "Ocupada",
  conta_pedida: "Conta pedida",
};

function CartaoMesa({ mesa }: { mesa: MesaNoMapa }) {
  return (
    <Link
      href={`/garcom/mesas/${mesa.id}`}
      aria-label={`Mesa ${mesa.numero}: ${ROTULO_STATUS[mesa.status]}`}
      className={cn(
        "flex min-h-28 flex-col justify-between rounded-xl border-2 p-3 transition-transform active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        mesa.status === "livre" && "border-border bg-background",
        mesa.status === "aberta" &&
          "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]",
        mesa.status === "conta_pedida" && "border-amber-500 bg-amber-300 text-amber-950",
      )}
    >
      {/* Nomes longos ("Varanda 1") em fonte menor para não quebrar no meio da palavra. */}
      <span className={cn("leading-tight font-bold break-words", mesa.numero.length > 3 ? "text-base" : "text-2xl leading-none")}>
        {mesa.numero}
      </span>
      <span className="flex flex-col text-xs leading-tight">
        <span className="font-semibold">{ROTULO_STATUS[mesa.status]}</span>
        {mesa.status !== "livre" ? (
          <>
            <span>{formatarBRL(mesa.total)}</span>
            {mesa.abertaEm ? <span className="opacity-80">{tempoDesde(mesa.abertaEm)}</span> : null}
          </>
        ) : null}
      </span>
    </Link>
  );
}

export default async function GarcomPage() {
  const acesso = await exigirAcesso("garcom");
  const [mesas, caixaAberto] = await Promise.all([
    carregarMapa(acesso.restaurante.id),
    caixaEstaAberto(acesso.restaurante.id),
  ]);
  const ocupadas = mesas.filter((m) => m.status !== "livre").length;

  return (
    <main className="flex flex-col gap-4 p-4">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["comandas"]} />
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Mesas</h1>
        <span className="text-sm text-muted-foreground">
          {ocupadas} de {mesas.length} ocupadas
        </span>
      </div>
      {!caixaAberto ? <AvisoCaixaFechado /> : null}
      {mesas.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma mesa cadastrada. O dono cadastra em Painel › Mesas.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
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
