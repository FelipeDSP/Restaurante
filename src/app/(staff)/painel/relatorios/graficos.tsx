import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Gráficos dos relatórios em CSS/SVG puro (sem biblioteca), renderizados no servidor.

export const MARCA = "var(--cor-primaria)";

// Cores das fatias das roscas: fixas para todo restaurante (a cor da marca pode ser qualquer uma e
// não garante fatias distintas). Ordem validada para vizinhas distintas, inclusive para daltônicos:
// azul, laranja, verde-água, mostarda, rosa, verde, roxo, vermelho. "Outros" fica em cinza.
export const CORES = ["#2f6fd0", "#e8743b", "#17a88b", "#e0a21b", "#d9669b", "#4c9a2a", "#6a57c8", "#d64545"];
export const COR_OUTROS = "#9ca3af";

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

// Linha do tempo (SVG): área preenchida, um ponto por item (pode ser link) e a média tracejada.
export function Linha({
  pontos,
  media,
}: {
  pontos: { chave: string; rotulo: string; valor: number; texto: string; href?: string }[];
  media?: { valor: number; texto: string };
}) {
  const maior = Math.max(...pontos.map((p) => p.valor), media?.valor ?? 0, 1);
  const n = pontos.length;
  // Posição em %: x com folga nas pontas; y com folga em cima para o ponto não cortar.
  const x = (i: number) => (n === 1 ? 50 : 4 + (i * 92) / (n - 1));
  const y = (v: number) => 100 - (v / maior) * 88;
  const linha = pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(" ");
  const area = n > 1 ? `${x(0)},100 ${linha} ${x(n - 1)},100` : "";
  // Muitos pontos: mostra só alguns rótulos embaixo.
  const passo = Math.ceil(n / 8);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-52 border-b">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {area ? <polygon points={area} fill={MARCA} fillOpacity={0.12} /> : null}
          {n > 1 ? (
            <polyline
              points={linha}
              fill="none"
              stroke={MARCA}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {media && media.valor > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-foreground/20" style={{ top: `${y(media.valor)}%` }}>
            <span className="absolute -top-5 right-0 rounded bg-background/90 px-1 text-[11px] text-muted-foreground">{media.texto}</span>
          </div>
        ) : null}
        {pontos.map((p, i) => {
          const dica = `${p.rotulo}: ${p.texto}`;
          const estilo = { left: `${x(i)}%`, top: `${y(p.valor)}%` };
          const classe = "group absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full";
          const bolinha = (
            <span className="block size-3 rounded-full border-2 border-[var(--cor-primaria)] bg-background transition-transform group-hover:scale-150" />
          );
          return p.href ? (
            <Link key={p.chave} href={p.href} className={classe} style={estilo} title={dica} aria-label={dica}>
              {bolinha}
            </Link>
          ) : (
            <span key={p.chave} className={classe} style={estilo} title={dica}>
              <span className="sr-only">{dica}</span>
              {bolinha}
            </span>
          );
        })}
      </div>
      <div className="relative h-4" aria-hidden>
        {pontos.map((p, i) =>
          i % passo === 0 ? (
            <span key={p.chave} className="absolute -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground" style={{ left: `${x(i)}%` }}>
              {p.rotulo}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

// Rosca (conic-gradient) com legenda. Cada fatia traz a sua cor (a mesma coisa tem sempre a mesma
// cor em qualquer período); sem cor, segue a ordem de CORES.
export type Fatia = { chave: string; rotulo: string; valor: number; texto: string; cor?: string };

export function Rosca({ fatias, centro, rotuloCentro }: { fatias: Fatia[]; centro: string; rotuloCentro: string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const cor = (f: Fatia, i: number) => f.cor ?? CORES[i % CORES.length];
  // Fresta de fundo entre as fatias, para separar cores vizinhas.
  const fresta = fatias.length > 1 ? 0.6 : 0;
  let acumulado = 0;
  const partes = fatias.map((f, i) => {
    const inicio = (acumulado / total) * 100;
    acumulado += f.valor;
    const fim = (acumulado / total) * 100;
    return `${cor(f, i)} ${inicio}% ${Math.max(inicio, fim - fresta)}%, var(--background) ${Math.max(inicio, fim - fresta)}% ${fim}%`;
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
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: cor(f, i) }} aria-hidden />
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
    <span className="block h-2 w-full rounded-full bg-muted" aria-hidden>
      <span className="block h-2 rounded-full" style={{ width: `${maior ? Math.max(3, (valor / maior) * 100) : 0}%`, backgroundColor: cor }} />
    </span>
  );
}
