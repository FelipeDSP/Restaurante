"use client";

import { Check, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { resumoAdicionais } from "@/lib/adicionais";
import { useRascunho } from "@/lib/rascunho";
import { horaLocal } from "@/lib/tempo";
import type { Ticket } from "@/lib/tickets-producao";
import { cn } from "@/lib/utils";

import { marcarTicketPraca } from "../actions";

type Props = {
  restauranteId: string;
  membroId: string;
  fuso: string;
  pracas: { id: string; nome: string }[];
  pendentes: Ticket[];
  prontos: Ticket[];
  geradoEm: number;
};

const TODAS = "todas";

function titulo(t: Ticket) {
  if (t.pedido.origem === "mesa" && t.pedido.mesa) return `Mesa ${t.pedido.mesa}`;
  if (t.pedido.origem === "delivery") return `Delivery nº ${t.pedido.numero}`;
  return "Balcão";
}

function minutosDesde(iso: string, agora: number) {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
}

// Praças pendentes antes desta (o prato ainda não pode sair daqui).
function esperando(t: Ticket) {
  return [...new Set(t.itens.filter((i) => !i.cancelado).flatMap((i) => i.aguardando))];
}

function CartaoTicket({ ticket, agora, minha, mostrarPraca }: { ticket: Ticket; agora: number; minha: boolean; mostrarPraca: boolean }) {
  const { pendente, executar } = useAcao();
  const minutos = minutosDesde(ticket.criadoEm, agora);
  const atrasado = minutos >= 20;
  const atencao = minutos >= 10 && !atrasado;
  const ativos = ticket.itens.filter((i) => !i.cancelado);
  const aguarda = esperando(ticket);

  return (
    <article
      aria-label={`${titulo(ticket)}, ${ticket.praca.nome}`}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-2 bg-background shadow-sm",
        atrasado ? "border-red-500" : atencao ? "border-amber-400" : minha ? "border-[var(--cor-primaria)]" : "border-transparent",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <h2 className="text-2xl leading-tight font-bold break-words">{titulo(ticket)}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {mostrarPraca ? <span className="font-semibold tracking-wide text-foreground uppercase">{ticket.praca.nome}</span> : null}
            {minha ? <span className="font-semibold text-[var(--cor-primaria-texto)]">sua mesa</span> : null}
            {ticket.pedido.origem === "delivery" && ticket.pedido.cliente ? <span>{ticket.pedido.cliente}</span> : null}
          </p>
        </div>
        <p className={cn("shrink-0 text-xl font-bold tabular-nums", atrasado ? "text-red-700" : atencao ? "text-amber-700" : "")}>
          {minutos} min
        </p>
      </header>
      <ul className="flex flex-col gap-1.5 px-4 py-3">
        {ticket.itens.map((i) => (
          <li key={i.id} className={cn("text-lg leading-snug", i.cancelado && "text-muted-foreground line-through")}>
            <span className="font-bold">{i.quantidade}×</span> {i.nome}
            {i.adicionais.length > 0 ? <span className="block text-base font-semibold">{resumoAdicionais(i.adicionais)}</span> : null}
            {i.observacao ? <span className="mt-0.5 block rounded-md bg-amber-100 px-2 text-sm font-semibold text-amber-950">{i.observacao}</span> : null}
          </li>
        ))}
      </ul>
      <footer className="border-t p-3">
        <Button
          type="button"
          className="h-14 w-full text-lg"
          disabled={pendente || aguarda.length > 0}
          onClick={() => executar(() => marcarTicketPraca(ticket.id, "pronto"))}
        >
          <Check className="size-5" />
          {aguarda.length > 0 ? `Aguardando ${aguarda.join(" e ")}` : ativos.length === 0 ? "Tirar da lista" : "Retirei — pronto"}
        </Button>
      </footer>
    </article>
  );
}

function LinhaPronto({ ticket, fuso }: { ticket: Ticket; fuso: string }) {
  const { pendente, executar } = useAcao();
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">
          {titulo(ticket)} · {ticket.praca.nome}
        </span>
        <span className="text-sm text-muted-foreground">pronto às {ticket.prontoEm ? horaLocal(ticket.prontoEm, fuso) : "—"}</span>
      </span>
      <Button type="button" variant="outline" className="h-11 shrink-0" disabled={pendente} onClick={() => executar(() => marcarTicketPraca(ticket.id, "pendente"))}>
        <Undo2 />
        Desfazer
      </Button>
    </li>
  );
}

const normalizarPraca = (v: unknown) => (typeof v === "string" ? v : null);

export function TicketsPracas({ restauranteId, membroId, fuso, pracas, pendentes, prontos, geradoEm }: Props) {
  // A praça escolhida fica no aparelho (cada garçom costuma ficar de olho na mesma).
  const [praca, setPraca] = useRascunho(`garcom-praca:${restauranteId}`, TODAS, normalizarPraca);
  // Relógio dos "min": o mais recente entre a hora do servidor (a cada atualização) e o tique local.
  const [tique, setTique] = useState(geradoEm);
  useEffect(() => {
    const t = setInterval(() => setTique(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const agora = Math.max(tique, geradoEm);

  const pracaValida = praca === TODAS || pracas.some((p) => p.id === praca) ? praca : TODAS;
  const daPraca = useCallback((t: Ticket) => pracaValida === TODAS || t.praca.id === pracaValida, [pracaValida]);

  // Primeiro os que dá para retirar; dentro deles, as mesas do garçom e os mais antigos.
  const lista = pendentes.filter(daPraca).sort((a, b) => {
    const aguardaA = esperando(a).length > 0 ? 1 : 0;
    const aguardaB = esperando(b).length > 0 ? 1 : 0;
    if (aguardaA !== aguardaB) return aguardaA - aguardaB;
    const minhaA = a.pedido.garcomId === membroId ? 0 : 1;
    const minhaB = b.pedido.garcomId === membroId ? 0 : 1;
    if (minhaA !== minhaB) return minhaA - minhaB;
    return a.criadoEm.localeCompare(b.criadoEm);
  });
  const recentes = prontos.filter(daPraca).slice(0, 6);
  const contagem = (id: string) => pendentes.filter((t) => id === TODAS || t.praca.id === id).length;

  return (
    <>
      {pracas.length > 1 ? (
        <nav aria-label="Praças" className="-mx-4 flex gap-2 overflow-x-auto px-4 sem-barra-rolagem">
          {[{ id: TODAS, nome: "Todas" }, ...pracas].map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pracaValida === p.id}
              onClick={() => setPraca(p.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
                pracaValida === p.id ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]" : "bg-background",
              )}
            >
              {p.nome}
              <span className="tabular-nums opacity-80">{contagem(p.id)}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {pracas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          Nenhuma praça cadastrada. O dono cadastra em Painel › Setores da cozinha.
        </p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Nada em preparo agora.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((t) => (
            <CartaoTicket key={t.id} ticket={t} agora={agora} minha={t.pedido.garcomId === membroId} mostrarPraca={pracaValida === TODAS} />
          ))}
        </div>
      )}

      {recentes.length > 0 ? (
        <details className="rounded-xl border bg-background px-4">
          <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Prontos agora há pouco ({recentes.length})</summary>
          <ul className="divide-y pb-2">
            {recentes.map((t) => (
              <LinhaPronto key={t.id} ticket={t} fuso={fuso} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
