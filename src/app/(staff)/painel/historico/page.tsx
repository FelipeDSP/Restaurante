import { ChevronRight, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAlgumaPermissao } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { dataHoraLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { carregarHistorico, PERIODOS, resolverPeriodo } from "./dados";

export const metadata: Metadata = { title: "Histórico" };

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  fechada: { rotulo: "Fechada", cor: "text-green-700" },
  entregue: { rotulo: "Entregue", cor: "text-green-700" },
  cancelada: { rotulo: "Cancelada", cor: "text-destructive" },
  cancelado: { rotulo: "Cancelado", cor: "text-destructive" },
};

const TIPOS = [
  { id: "todos", rotulo: "Tudo" },
  { id: "mesas", rotulo: "Mesas" },
  { id: "delivery", rotulo: "Delivery" },
] as const;

// Comandas encerradas e deliveries terminados, para consultar e mostrar ao cliente. Nada aqui muda.
export default async function HistoricoPage(props: PageProps<"/painel/historico">) {
  const acesso = await exigirAlgumaPermissao("caixa_operar", "relatorios");
  const params = await props.searchParams;
  const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const fuso = acesso.restaurante.fusoHorario;
  const periodo = resolverPeriodo(fuso, { periodo: texto(params.periodo), de: texto(params.de), ate: texto(params.ate) });
  const tipo = TIPOS.some((t) => t.id === texto(params.tipo)) ? (texto(params.tipo) as "todos" | "mesas" | "delivery") : "todos";
  const busca = (texto(params.busca) ?? "").slice(0, 60);
  const { linhas, cortado } = await carregarHistorico(acesso.restaurante.id, fuso, periodo, { tipo, busca });
  const total = linhas.filter((l) => l.situacao === "fechada" || l.situacao === "entregue").reduce((s, l) => s + l.total, 0);

  const link = (extra: Record<string, string>) => {
    const atual: Record<string, string> = periodo.periodo ? { periodo: periodo.periodo } : { de: periodo.de, ate: periodo.ate };
    const base: Record<string, string> = { ...atual, tipo, ...(busca ? { busca } : {}) };
    return `/painel/historico?${new URLSearchParams({ ...base, ...extra })}`;
  };

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />
          Contas encerradas não podem ser alteradas.
        </p>
      </div>

      <section aria-label="Filtros" className="flex flex-col gap-3 rounded-2xl border bg-background p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.id}
              href={`/painel/historico?${new URLSearchParams({ periodo: p.id, tipo, ...(busca ? { busca } : {}) })}`}
              aria-current={periodo.periodo === p.id ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                periodo.periodo === p.id ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "hover:bg-muted",
              )}
            >
              {p.rotulo}
            </Link>
          ))}
          <span className="mx-1 hidden w-px bg-border sm:block" aria-hidden />
          {TIPOS.map((t) => (
            <Link
              key={t.id}
              href={link({ tipo: t.id })}
              aria-current={tipo === t.id ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                tipo === t.id ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {t.rotulo}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/painel/historico">
          <input type="hidden" name="tipo" value={tipo} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            De
            <Input type="date" name="de" defaultValue={periodo.de} className="h-11 w-40" required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Até
            <Input type="date" name="ate" defaultValue={periodo.ate} className="h-11 w-40" required />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
            Buscar
            <Input name="busca" defaultValue={busca} placeholder="Mesa, nº do pedido, cliente ou garçom" className="h-11" />
          </label>
          <Button type="submit" variant="outline" className="h-11">
            Ver
          </Button>
        </form>
      </section>

      {linhas.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Nada encerrado neste período.</p>
      ) : (
        <section aria-label="Contas encerradas" className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {linhas.length} {linhas.length === 1 ? "conta" : "contas"} · {formatarBRL(total)} sem as canceladas
            {cortado ? " · mostrando as mais recentes; diminua o período para ver todas" : ""}
          </p>
          <ul className="flex flex-col divide-y rounded-2xl border bg-background">
            {linhas.map((l) => (
              <li key={`${l.tipo}-${l.id}`}>
                <Link
                  href={`/painel/historico/${l.tipo === "comanda" ? "comanda" : "pedido"}/${l.id}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted/50"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {l.titulo}
                      {l.quem ? <span className="font-normal text-muted-foreground"> · {l.quem}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.quando ? dataHoraLocal(l.quando, fuso) : ""} ·{" "}
                      <span className={SITUACAO[l.situacao]?.cor}>{SITUACAO[l.situacao]?.rotulo}</span>
                    </span>
                  </span>
                  <span className={cn("font-semibold tabular-nums", (l.situacao === "cancelada" || l.situacao === "cancelado") && "text-muted-foreground line-through")}>
                    {formatarBRL(l.total)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
