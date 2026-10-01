"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";

import { abrirComanda } from "../../actions";

export function AbrirComanda({ mesaId, desabilitado }: { mesaId: string; desabilitado: boolean }) {
  const [pessoas, setPessoas] = useState(2);
  const { pendente, executar } = useAcao();

  return (
    <section aria-labelledby="titulo-abrir" className="flex flex-col gap-6 rounded-xl border p-4">
      <div>
        <h2 id="titulo-abrir" className="text-lg font-semibold">
          Mesa livre
        </h2>
        <p className="text-sm text-muted-foreground">Quantas pessoas?</p>
      </div>
      <div className="flex items-center justify-center gap-6">
        <Button
          type="button"
          variant="outline"
          className="size-14 rounded-full"
          aria-label="Menos uma pessoa"
          onClick={() => setPessoas((p) => Math.max(1, p - 1))}
        >
          <Minus className="size-6" />
        </Button>
        <span className="w-16 text-center text-4xl font-bold tabular-nums" aria-live="polite">
          {pessoas}
        </span>
        <Button
          type="button"
          variant="outline"
          className="size-14 rounded-full"
          aria-label="Mais uma pessoa"
          onClick={() => setPessoas((p) => Math.min(100, p + 1))}
        >
          <Plus className="size-6" />
        </Button>
      </div>
      <Button
        type="button"
        className="h-14 text-lg"
        disabled={desabilitado || pendente}
        onClick={() => executar(() => abrirComanda(mesaId, pessoas))}
      >
        {pendente ? "Abrindo..." : "Abrir comanda"}
      </Button>
    </section>
  );
}
