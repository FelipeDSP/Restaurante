import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Gráficos dos relatórios em CSS/SVG puro (sem biblioteca), renderizados no servidor.

// Tons da cor do restaurante (fatias e legendas): a própria cor e misturas com branco.
export const MARCA = "var(--cor-primaria)";
export const CORES = [100, 70, 45, 85, 58, 32, 92].map((p) => (p === 100 ? MARCA : `color-mix(in oklch, ${MARCA} ${p}%, white)`));

// Variação em relação ao período anterior; null quando não há base para comparar.
export function variacao(atual: number, anterior: number | null): number | null {
  if (anterior === null || anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export function Kpi({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  destaque = false,
  delta,
  quedaEhBoa = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  icone: LucideIcon;
  // Cartão principal: preenchido com a cor do restaurante.
  destaque?: boolean;
  delta: number | null;
  quedaEhBoa?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-1 overflow-hidden rounded-2xl p-4 shadow-sm",
        destaque ? "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "border bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-sm font-medium", destaque ? "opacity-90" : "text-muted-foreground")}>{rotulo}</p>
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            destaque ? "bg-white/20" : "bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]",
          )}
          aria-hidden
        >
          <Icone className="size-5" />
        </span>
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{valor}</p>
      <div className={cn("flex min-h-5 flex-wrap items-center gap-x-2 text-xs", destaque ? "opacity-90" : "text-muted-foreground")}>
        {delta !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              destaque ? "bg-white/20" : "bg-muted text-foreground",
              delta !== 0 && (delta > 0) === quedaEhBoa && "opacity-70",
            )}
            title="Em relação ao período anterior do mesmo tamanho"
          >
            {delta > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : null}
            {delta > 0 ? "+" : ""}
            {delta}%<span className="sr-only"> em relação ao período anterior</span>
          </span>
        ) : null}
        {detalhe ? <span>{detalhe}</span> : null}
      </div>
      {destaque ? <span className="pointer-events-none absolute -right-6 -bottom-8 size-24 rounded-full bg-white/10" aria-hidden /> : null}
    </div>
  );
}

export function Painel({ titulo, acao, children, className }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl border bg-background p-4 shadow-sm md:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// Colunas verticais (linha do tempo, horários). Cada coluna pode ser um link.
export function Colunas({
  colunas,
  cor = CORES[0],
  media,
}: {
  colunas: { chave: string; rotulo: string; valor: number; texto: string; href?: string }[];
  cor?: string;
  // Linha tracejada da média (mesma unidade de `valor`).
  media?: { valor: number; texto: string };
}) {
  const maior = Math.max(...colunas.map((c) => c.valor), media?.valor ?? 0, 1);
  // Muitas colunas: mostra só alguns rótulos embaixo.
  const passo = Math.ceil(colunas.length / 10);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-48 items-end justify-around gap-1 border-b sm:gap-2">
        {media && media.valor > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-foreground/25" style={{ bottom: `${(media.valor / maior) * 100}%` }}>
            <span className="absolute -top-5 right-0 rounded bg-background/90 px-1 text-[11px] text-muted-foreground">{media.texto}</span>
          </div>
        ) : null}
        {colunas.map((c) => {
          const barra = (
            <span
              className="block w-full rounded-t-lg transition-opacity group-hover:opacity-80"
              style={{ height: `${c.valor > 0 ? Math.max(2, (c.valor / maior) * 100) : 0}%`, backgroundColor: cor }}
            />
          );
          const comum = "group relative flex h-full min-w-0 max-w-16 flex-1 flex-col items-center justify-end";
          const dica = `${c.rotulo}: ${c.texto}`;
          return c.href ? (
            <Link key={c.chave} href={c.href} className={comum} title={dica} aria-label={dica}>
              {barra}
            </Link>
          ) : (
            <span key={c.chave} className={comum} title={dica}>
              <span className="sr-only">{dica}</span>
              {barra}
            </span>
          );
        })}
      </div>
      <div className="flex justify-around gap-1 sm:gap-2" aria-hidden>
        {colunas.map((c, i) => (
          <span key={c.chave} className="min-w-0 max-w-16 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {i % passo === 0 ? c.rotulo : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// Rosca (conic-gradient) com legenda.
export function Rosca({ fatias, centro, rotuloCentro }: { fatias: { chave: string; rotulo: string; valor: number; texto: string }[]; centro: string; rotuloCentro: string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  let acumulado = 0;
  const partes = fatias.map((f, i) => {
    const inicio = (acumulado / total) * 100;
    acumulado += f.valor;
    return `${CORES[i % CORES.length]} ${inicio}% ${(acumulado / total) * 100}%`;
  });
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div
        className="relative grid size-40 shrink-0 place-items-center rounded-full"
        style={{ background: total ? `conic-gradient(${partes.join(", ")})` : "var(--muted)" }}
        aria-hidden
      >
        <div className="grid size-26 place-items-center rounded-full bg-background text-center">
          <div>
            <p className="text-base font-bold tabular-nums">{centro}</p>
            <p className="text-[11px] text-muted-foreground">{rotuloCentro}</p>
          </div>
        </div>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {fatias.map((f, i) => (
          <li key={f.chave} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: CORES[i % CORES.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
            <span className="text-muted-foreground tabular-nums">{total ? Math.round((f.valor / total) * 100) : 0}%</span>
            <span className="w-24 text-right font-medium tabular-nums">{f.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Barras horizontais coloridas (dia da semana, bairros...).
export function Barras({ linhas, cor }: { linhas: { chave: string; rotulo: string; valor: number; texto: string; detalhe?: string }[]; cor?: string }) {
  const maior = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <ul className="flex flex-col gap-3">
      {linhas.map((l) => (
        <li key={l.chave} className="flex flex-col gap-1 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{l.rotulo}</span>
            <span className="shrink-0 tabular-nums">
              {l.texto}
              {l.detalhe ? <span className="ml-1.5 text-xs text-muted-foreground">{l.detalhe}</span> : null}
            </span>
          </div>
          <span className="h-2.5 rounded-full bg-muted" aria-hidden>
            <span
              className="block h-2.5 rounded-full"
              style={{ width: `${l.valor > 0 ? Math.max(2, (l.valor / maior) * 100) : 0}%`, backgroundColor: cor ?? MARCA }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Barrinha dentro de uma célula de tabela.
export function BarraCelula({ valor, maior, cor }: { valor: number; maior: number; cor: string }) {
  return (
    <span className="hidden h-2 w-20 rounded-full bg-muted sm:block" aria-hidden>
      <span className="block h-2 rounded-full" style={{ width: `${maior ? Math.max(3, (valor / maior) * 100) : 0}%`, backgroundColor: cor }} />
    </span>
  );
}
