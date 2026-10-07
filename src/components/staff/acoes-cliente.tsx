"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";

// Mensagem para quando a ação nem chegou ao servidor (ou a resposta se perdeu no caminho).
export function mensagemFalhaRede(): string {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "Sem internet. Nada foi perdido: tente de novo quando a conexão voltar."
    : "Não deu para falar com o sistema. Nada foi perdido: tente de novo.";
}

// Executa uma Server Action fora de formulário e mostra o resultado em aviso.
// Falha de rede vira aviso (a tela e o que foi digitado continuam); toque repetido é ignorado.
export function useAcao() {
  const [pendente, iniciar] = useTransition();
  const emAndamento = useRef(false);

  function executar(acao: () => Promise<ResultadoAcao>, aoSucesso?: () => void) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    iniciar(async () => {
      try {
        const resultado = await acao();
        if (resultado?.mensagem) {
          if (resultado.ok) toast.success(resultado.mensagem);
          else toast.error(resultado.mensagem);
        }
        if (resultado?.ok) aoSucesso?.();
      } catch {
        toast.error(mensagemFalhaRede());
      } finally {
        emAndamento.current = false;
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
