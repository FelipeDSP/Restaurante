"use client";

import { RefreshCw } from "lucide-react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";

import { trocarQrMesa } from "../actions";

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
