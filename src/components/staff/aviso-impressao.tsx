"use client";

import { Printer, RotateCcw } from "lucide-react";

import { reimprimirFalhas } from "@/app/(staff)/painel/impressoras/actions";
import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";

// A impressora ficou fora do ar tempo demais e a fila desistiu daqueles tickets. Antes isso
// acontecia calado: só o dono, abrindo Painel > Impressoras, descobria. Agora a cozinha e o
// caixa veem na tela em que já estão, e quem pode manda tudo de volta para a fila de uma vez.
export function AvisoImpressao({ quantos, podeReimprimir }: { quantos: number; podeReimprimir: boolean }) {
  const { pendente, executar } = useAcao();
  if (quantos <= 0) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-red-900 print:hidden"
    >
      <Printer className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-semibold">
        {quantos === 1 ? "1 impressão não saiu" : `${quantos} impressões não saíram`}: a impressora ficou fora do ar tempo
        demais.{" "}
        <span className="font-normal">
          {podeReimprimir ? "Resolva a impressora e mande imprimir de novo." : "Avise o caixa para mandar imprimir de novo."}
        </span>
      </p>
      {podeReimprimir ? (
        <Button type="button" className="h-11" disabled={pendente} onClick={() => executar(() => reimprimirFalhas())}>
          <RotateCcw />
          Imprimir tudo de novo
        </Button>
      ) : null}
    </div>
  );
}
