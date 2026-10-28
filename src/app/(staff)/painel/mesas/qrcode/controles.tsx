"use client";

import { RefreshCw } from "lucide-react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { cn } from "@/lib/utils";

import { alternarPedidoMesa, trocarQrMesa } from "../actions";

export function ChavePedidoMesa({ ligado }: { ligado: boolean }) {
  const { executar, pendente } = useAcao();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={pendente}
      onClick={() => executar(() => alternarPedidoMesa(!ligado))}
      className="flex min-h-11 items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left font-medium hover:bg-muted disabled:opacity-50 print:hidden"
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          ligado ? "bg-[var(--cor-primaria-texto)]" : "bg-muted-foreground/30",
        )}
      >
        <span className={cn("size-5 rounded-full bg-white shadow-sm transition-transform", ligado ? "translate-x-5" : "translate-x-0")} />
      </span>
      Clientes pedem pelo celular
    </button>
  );
}

export function TrocarQr({ mesaId, mesa }: { mesaId: string; mesa: string }) {
  const { executar, pendente } = useAcao();
  return (
    <span className="print:hidden">
      <BotaoConfirmar
        rotulo={`Trocar o QR code da mesa ${mesa}`}
        confirmar="Trocar código"
        icone={false}
        desabilitado={pendente}
        aoConfirmar={() => executar(() => trocarQrMesa(mesaId))}
        className="h-9 text-xs"
      >
        <RefreshCw aria-hidden />
        Trocar código
      </BotaoConfirmar>
    </span>
  );
}
