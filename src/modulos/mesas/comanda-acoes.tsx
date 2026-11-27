"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Stepper } from "@/components/staff/stepper";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { alterarCobranca, alterarPessoas, assumirMesa } from "./actions";
import type { DetalheComanda } from "./dados";

// Ações da mesa que não são item nem pagamento: serviço e couvert, quantidade de pessoas e
// assumir uma mesa aberta pelo cliente. Saiu de tela-comanda.tsx, que tinha mil linhas.

// Serviço e couvert da mesa: aparecem só quando o restaurante cobra; tirar/cobrar de novo com um toque.
export function Cobrancas({ comandaId, pessoas, cobranca }: { comandaId: string; pessoas: number | null; cobranca: DetalheComanda["cobranca"] }) {
  const { pendente, executar } = useAcao();
  if (cobranca.servicoPercentual === 0 && cobranca.couvertUnitario === 0) return null;
  const linha = (rotulo: string, valor: number, cobrando: boolean, tipo: "servico" | "couvert") => (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={cn(!cobrando && "text-muted-foreground line-through")}>{rotulo}</span>
      <span className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pendente}
          onClick={() => executar(() => alterarCobranca(comandaId, tipo, !cobrando))}
        >
          {cobrando ? "Tirar" : "Cobrar"}
        </Button>
        <span className="w-20 text-right tabular-nums">{cobrando ? formatarBRL(valor) : "—"}</span>
      </span>
    </div>
  );
  return (
    <>
      <div className="flex justify-between text-sm">
        <span>Itens</span>
        <span className="tabular-nums">{formatarBRL(cobranca.subtotal)}</span>
      </div>
      {cobranca.servicoPercentual > 0 ? linha(`Serviço (${cobranca.servicoPercentual}%)`, cobranca.servico, cobranca.cobrarServico, "servico") : null}
      {cobranca.couvertUnitario > 0
        ? linha(`Couvert (${pessoas ?? 0} × ${formatarBRL(cobranca.couvertUnitario)})`, cobranca.couvert, cobranca.cobrarCouvert, "couvert")
        : null}
    </>
  );
}

// Chegou ou saiu gente: o garçom muda a quantidade de pessoas com a mesa aberta.
export function EditarPessoas({ comandaId, pessoas }: { comandaId: string; pessoas: number | null }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(pessoas ?? 1);
  const { pendente, executar } = useAcao();

  if (!editando) {
    return (
      <button
        type="button"
        className="flex min-h-11 items-center gap-1 rounded-md px-1 underline-offset-4 hover:underline"
        onClick={() => {
          setValor(pessoas ?? 1);
          setEditando(true);
        }}
      >
        · {pessoas ? `${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}` : "quantas pessoas?"}
        <Pencil className="size-3.5" aria-hidden />
        <span className="sr-only">Mudar a quantidade de pessoas</span>
      </button>
    );
  }
  return (
    <div className="flex w-full items-center gap-2 rounded-lg bg-muted/60 p-2" role="group" aria-label="Quantidade de pessoas">
      <Stepper valor={valor} aoMudar={setValor} rotulo="pessoas" />
      <span className="text-sm">{valor === 1 ? "pessoa" : "pessoas"}</span>
      <Button
        type="button"
        className="ml-auto h-11"
        disabled={pendente || valor === pessoas}
        onClick={() => executar(() => alterarPessoas(comandaId, valor), () => setEditando(false))}
      >
        Salvar
      </Button>
      <Button type="button" variant="ghost" className="h-11" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
    </div>
  );
}

// Mesa aberta pelo cliente (QR code): ninguém atende até alguém assumir.
export function AssumirMesa({ comandaId }: { comandaId: string }) {
  const { pendente, executar } = useAcao();
  return (
    <Button type="button" size="sm" disabled={pendente} onClick={() => executar(() => assumirMesa(comandaId))}>
      Sem garçom · Assumir
    </Button>
  );
}
