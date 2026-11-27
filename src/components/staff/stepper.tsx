"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

// Mais/menos de uma mão só: quantidade de item, de pessoas na mesa e de unidades na calculadora
// da conta. O número fica grande no meio, para ler de longe com o salão cheio.
export function Stepper({ valor, aoMudar, rotulo }: { valor: number; aoMudar: (n: number) => void; rotulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={`Diminuir ${rotulo}`}
        disabled={valor <= 1}
        onClick={() => aoMudar(valor - 1)}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
        {valor}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={`Aumentar ${rotulo}`}
        disabled={valor >= 99}
        onClick={() => aoMudar(valor + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}
