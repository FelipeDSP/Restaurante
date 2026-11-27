"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

import { alternarDelivery, alternarRetirada } from "./actions";

const DESISTE_MS = 6000;

// Pausar é decisão de meio de serviço (a cozinha entope, acabou o insumo, o entregador sumiu), e
// era um checkbox no meio do formulário grande de Painel › Restaurante — de onde salvar o
// formulário desfazia a pausa. Aqui cada jeito de receber tem a sua chave, dizendo em que estado
// está.
//
// Quem pode é quem tem a permissão `restaurante`. Para os outros, aparece como aviso, sem botão:
// saber que o site está pausado importa para todo mundo no caixa.
type Jeito = {
  ligado: boolean;
  ligadoTexto: string;
  pausadoTexto: string;
  pausar: string;
  voltar: string;
  confirmar: string;
  aoMudar: (ligado: boolean) => Promise<ResultadoAcao>;
};

function Faixa({ jeito, podeMudar, className }: { jeito: Jeito; podeMudar: boolean; className?: string }) {
  const { executar, pendente } = useAcao();
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), DESISTE_MS);
    return () => clearTimeout(t);
  }, [armado]);

  const estado = jeito.ligado ? (
    <span className="flex items-center gap-2 font-semibold">
      <span aria-hidden className="size-2.5 rounded-full bg-green-600" />
      {jeito.ligadoTexto}
    </span>
  ) : (
    <span className="flex items-center gap-2 font-semibold">
      <Pause className="size-4" aria-hidden />
      {jeito.pausadoTexto}
    </span>
  );

  return (
    <div
      role="status"
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm",
        jeito.ligado ? "border-green-700/30 bg-green-50 text-green-900" : "border-amber-400 bg-amber-50 text-amber-950",
        className,
      )}
    >
      {estado}
      {!podeMudar ? null : armado ? (
        <span className="ml-auto flex items-center gap-1" role="group" aria-label={jeito.ligado ? jeito.pausar : jeito.voltar}>
          <Button
            type="button"
            variant={jeito.ligado ? "destructive" : "default"}
            className="h-11 sm:h-9"
            disabled={pendente}
            onClick={() => {
              setArmado(false);
              executar(() => jeito.aoMudar(!jeito.ligado));
            }}
          >
            {jeito.ligado ? jeito.confirmar : "Confirmar"}
          </Button>
          <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setArmado(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button type="button" variant="outline" className="ml-auto h-11 sm:h-9" disabled={pendente} onClick={() => setArmado(true)}>
          {jeito.ligado ? (
            <>
              <Pause aria-hidden /> {jeito.pausar}
            </>
          ) : (
            <>
              <Play aria-hidden /> {jeito.voltar}
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// `mostrarRetirada`: no Início a faixa aparece só para o que está pausado, então o chamador diz
// quais mostrar. No quadro do Delivery aparecem as duas.
export function ChaveDelivery({
  entrega,
  retirada,
  podeMudar,
  mostrar = "ambas",
  className,
}: {
  entrega: boolean;
  retirada: boolean;
  podeMudar: boolean;
  mostrar?: "ambas" | "entrega" | "retirada";
  className?: string;
}) {
  const jeitos: Jeito[] = [];
  if (mostrar !== "retirada") {
    jeitos.push({
      ligado: entrega,
      ligadoTexto: "O site está entregando",
      pausadoTexto: "Entrega pausada: o site não recebe pedido para entregar",
      pausar: "Pausar a entrega",
      voltar: "Voltar a entregar",
      confirmar: "Confirmar a pausa",
      aoMudar: alternarDelivery,
    });
  }
  if (mostrar !== "entrega") {
    jeitos.push({
      ligado: retirada,
      ligadoTexto: "O cliente pode pedir para retirar",
      pausadoTexto: "Retirada pausada: o cliente não pede para retirar",
      pausar: "Pausar a retirada",
      voltar: "Aceitar retirada no local",
      confirmar: "Confirmar a pausa",
      aoMudar: alternarRetirada,
    });
  }
  return (
    <div className="flex flex-wrap gap-2">
      {jeitos.map((j) => (
        <Faixa key={j.pausar} jeito={j} podeMudar={podeMudar} className={className} />
      ))}
    </div>
  );
}
