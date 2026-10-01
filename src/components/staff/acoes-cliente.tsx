"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";

// Executa uma Server Action fora de formulário e mostra o resultado em aviso.
export function useAcao() {
  const [pendente, iniciar] = useTransition();

  function executar(acao: () => Promise<ResultadoAcao>) {
    iniciar(async () => {
      const resultado = await acao();
      if (resultado?.mensagem) {
        if (resultado.ok) toast.success(resultado.mensagem);
        else toast.error(resultado.mensagem);
      }
    });
  }

  return { pendente, executar };
}

export function ControlesOrdem({
  rotulo,
  primeiro,
  ultimo,
  aoMover,
  desabilitado,
}: {
  rotulo: string;
  primeiro: boolean;
  ultimo: boolean;
  aoMover: (direcao: "cima" | "baixo") => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="flex">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Mover ${rotulo} para cima`}
        disabled={primeiro || desabilitado}
        onClick={() => aoMover("cima")}
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Mover ${rotulo} para baixo`}
        disabled={ultimo || desabilitado}
        onClick={() => aoMover("baixo")}
      >
        <ChevronDown />
      </Button>
    </div>
  );
}
