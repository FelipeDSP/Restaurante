import { ChevronLeft, Lock } from "lucide-react";
import Link from "next/link";

import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma } from "@/lib/rotulos";
import { dataHoraLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { BotaoImprimir } from "./botao-imprimir";
import type { ItemHistorico, PagamentoHistorico } from "./dados";

// Peças das telas de detalhe do histórico (só leitura).

export function Cabecalho({ titulo, selo, children }: { titulo: string; selo: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/painel/historico" className="flex min-h-11 items-center gap-1 text-sm font-medium">
          <ChevronLeft className="size-4" aria-hidden />
          Histórico
        </Link>
        <BotaoImprimir />
      </div>
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      {selo}
      {children}
    </div>
  );
}

export function SeloEncerrada({ texto }: { texto: string }) {
  return (
    <p className="flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
      <Lock className="size-3.5" aria-hidden />
      {texto}
    </p>
  );
}

export function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-background p-4 break-inside-avoid">
      <h2 className="font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

export function ListaItens({ itens }: { itens: ItemHistorico[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {itens.map((i) => (
        <li key={i.id} className="flex flex-col gap-0.5 py-2">
          <span className={cn("flex justify-between gap-3", i.cancelado && "text-muted-foreground line-through")}>
            <span>
              {i.quantidade}× {i.nome}
            </span>
            <span className="tabular-nums">{formatarBRL(i.total)}</span>
          </span>
          {i.opcoes ? <span className="text-xs text-muted-foreground">{i.opcoes}</span> : null}
          {i.observacao ? <span className="text-xs text-muted-foreground">Obs.: {i.observacao}</span> : null}
          {i.cancelado ? (
            <span className="text-xs text-destructive">
              Cancelado{i.cancelado.por ? ` por ${i.cancelado.por}` : ""}
              {i.cancelado.motivo ? `: ${i.cancelado.motivo}` : ""}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ListaPagamentos({ pagamentos, fuso }: { pagamentos: PagamentoHistorico[]; fuso: string }) {
  if (pagamentos.length === 0) return <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>;
  return (
    <ul className="flex flex-col divide-y">
      {pagamentos.map((p) => (
        <li key={p.id} className="flex flex-col gap-0.5 py-2">
          <span className={cn("flex justify-between gap-3", p.estorno && "text-muted-foreground line-through")}>
            <span>{nomeForma(p.forma)}</span>
            <span className="tabular-nums">{formatarBRL(p.valor)}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {dataHoraLocal(p.em, fuso)}
            {p.por ? ` · recebido por ${p.por}` : ""}
          </span>
          {p.estorno ? (
            <span className="text-xs text-destructive">
              Estornado em {dataHoraLocal(p.estorno.em, fuso)}
              {p.estorno.por ? ` por ${p.estorno.por}` : ""}
              {p.estorno.motivo ? `: ${p.estorno.motivo}` : ""}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", forte ? "text-base font-semibold" : "text-sm text-muted-foreground")}>
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}
