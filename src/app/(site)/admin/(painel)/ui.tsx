import type { LucideIcon } from "lucide-react";

import { PLANOS } from "@/lib/planos";
import { cn } from "@/lib/utils";

import type { Financeiro } from "../dados";

// Peças visuais do painel da plataforma (servidor e navegador).

export function Titulo({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight md:text-3xl">{titulo}</h1>
        {subtitulo ? <p className="mt-1 text-sm text-uau-marrom-claro">{subtitulo}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Cartao({
  titulo,
  acao,
  children,
  className,
}: {
  titulo?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm", className)}>
      {titulo || acao ? (
        <div className="flex items-center justify-between gap-3">
          {titulo ? <h2 className="text-sm font-black tracking-wide text-uau-marrom-claro uppercase">{titulo}</h2> : <span />}
          {acao}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TOM = {
  neutro: "bg-uau-marrom/5 text-uau-marrom",
  laranja: "bg-uau-laranja/15 text-uau-laranja-escuro",
  verde: "bg-green-100 text-green-800",
  vermelho: "bg-red-100 text-red-700",
  azul: "bg-sky-100 text-sky-800",
} as const;

export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  icone: LucideIcon;
  tom?: keyof typeof TOM;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TOM[tom])}>
        <Icone className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-uau-marrom-claro">{rotulo}</p>
        <p className="text-2xl font-black tracking-tight tabular-nums">{valor}</p>
        {detalhe ? <p className="text-xs text-uau-marrom-claro">{detalhe}</p> : null}
      </div>
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-black/10 p-6 text-center text-sm text-uau-marrom-claro">{children}</p>;
}

// Receita mensal recorrente: assinaturas que pagam (em dia ou atrasadas) × preço do plano.
export function receitaMensal(porPlano: Financeiro["por_plano"]) {
  const linhas = PLANOS.map((p) => {
    const ativas = porPlano.filter((x) => x.plano === p.id && x.status === "ativa").reduce((s, x) => s + x.quantidade, 0);
    const atrasadas = porPlano.filter((x) => x.plano === p.id && x.status === "atrasada").reduce((s, x) => s + x.quantidade, 0);
    return { plano: p, ativas, atrasadas, valor: (ativas + atrasadas) * p.precoMensal };
  });
  return { linhas, total: linhas.reduce((s, l) => s + l.valor, 0), assinantes: linhas.reduce((s, l) => s + l.ativas + l.atrasadas, 0) };
}
