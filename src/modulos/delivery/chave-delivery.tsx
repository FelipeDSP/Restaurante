"use client";

import { ChevronDown, Pause, Play } from "lucide-react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

import { alternarDelivery, alternarRetirada } from "./actions";

// O site recebe pedido de dois jeitos (entrega e retirada) e cada um se pausa sozinho: a cozinha
// entope, some o entregador, acaba o insumo. Mas duas faixas coloridas no topo do quadro comiam
// a tela antes do trabalho começar, e na maior parte das noites não há nada a dizer.
//
// Então: quando os dois estão ligados é uma linha quieta, sem caixa; quando algo está pausado
// vira faixa de aviso, que é quando vale ocupar espaço. A ação é sempre um botão só, com menu —
// escolher "Pausar a entrega" numa lista já é deliberado, não precisa de confirmação em cima.
//
// Quem pode é quem tem a permissão `restaurante`. Para os outros fica só o aviso, sem botão:
// saber que o site está pausado importa para todo mundo no caixa.
type Item = { rotulo: string; aoEscolher: () => Promise<ResultadoAcao> };

export function ChaveDelivery({
  entrega,
  retirada,
  podeMudar,
  className,
}: {
  entrega: boolean;
  retirada: boolean;
  podeMudar: boolean;
  className?: string;
}) {
  const { executar, pendente } = useAcao();
  const tudoLigado = entrega && retirada;
  const nadaLigado = !entrega && !retirada;

  const texto = tudoLigado
    ? "Recebendo entrega e retirada"
    : nadaLigado
      ? "O site não está recebendo pedidos"
      : entrega
        ? "Retirada pausada · recebendo só entrega"
        : "Entrega pausada · recebendo só retirada";

  const itens: Item[] = [
    { rotulo: entrega ? "Pausar a entrega" : "Voltar a entregar", aoEscolher: () => alternarDelivery(!entrega) },
    { rotulo: retirada ? "Pausar a retirada" : "Aceitar retirada no local", aoEscolher: () => alternarRetirada(!retirada) },
  ];
  if (tudoLigado) {
    itens.push({
      rotulo: "Pausar tudo",
      aoEscolher: async () => {
        await alternarDelivery(false);
        return alternarRetirada(false);
      },
    });
  }
  if (nadaLigado) {
    itens.push({
      rotulo: "Voltar a receber tudo",
      aoEscolher: async () => {
        await alternarDelivery(true);
        return alternarRetirada(true);
      },
    });
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        tudoLigado
          ? "text-muted-foreground"
          : // Algo pausado: linha própria, com cor, porque muda o que o cliente consegue fazer.
            "w-full rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 font-semibold text-amber-950",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        {tudoLigado ? <span aria-hidden className="size-2.5 rounded-full bg-green-600" /> : <Pause className="size-4" aria-hidden />}
        {texto}
      </span>
      {podeMudar ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pendente}
            className={cn(
              "flex h-9 pointer-coarse:h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 font-medium disabled:opacity-50",
              tudoLigado ? "bg-background hover:bg-muted" : "ml-auto border-amber-500 bg-background hover:bg-amber-100",
            )}
          >
            {tudoLigado ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {tudoLigado ? "Pausar" : "Voltar a receber"}
            <ChevronDown className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            {itens.map((i) => (
              <DropdownMenuItem key={i.rotulo} className="h-11" onClick={() => executar(i.aoEscolher)}>
                {i.rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
