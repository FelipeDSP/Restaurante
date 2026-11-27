"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { alternarDelivery } from "./actions";

const DESISTE_MS = 6000;

// Pausar o delivery é decisão de meio de serviço (a cozinha entope, acabou o insumo), e estava
// num checkbox no meio do formulário grande de Painel › Restaurante — de onde salvar o
// formulário desfazia a pausa. Aqui é um controle só: liga, desliga e diz em que estado está.
//
// Quem pode é quem tem a permissão `restaurante` (a mesma de antes). Para os outros, o controle
// aparece como aviso, sem botão: saber que o site está pausado importa para todo mundo no caixa.
export function ChaveDelivery({ aceita, podeMudar, className }: { aceita: boolean; podeMudar: boolean; className?: string }) {
  const { executar, pendente } = useAcao();
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), DESISTE_MS);
    return () => clearTimeout(t);
  }, [armado]);

  const faixa = cn(
    "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm",
    aceita ? "border-green-700/30 bg-green-50 text-green-900" : "border-amber-400 bg-amber-50 text-amber-950",
    className,
  );

  const estado = aceita ? (
    <span className="flex items-center gap-2 font-semibold">
      <span aria-hidden className="size-2.5 rounded-full bg-green-600" />
      O site está recebendo pedidos
    </span>
  ) : (
    <span className="flex items-center gap-2 font-semibold">
      <Pause className="size-4" aria-hidden />
      Delivery pausado: o site não recebe pedidos
    </span>
  );

  if (!podeMudar) {
    return (
      <div role="status" className={faixa}>
        {estado}
      </div>
    );
  }

  return (
    <div role="status" className={faixa}>
      {estado}
      {armado ? (
        <span className="ml-auto flex items-center gap-1" role="group" aria-label={aceita ? "Pausar o delivery" : "Voltar a receber pedidos"}>
          <Button
            type="button"
            variant={aceita ? "destructive" : "default"}
            className="h-11 sm:h-9"
            disabled={pendente}
            onClick={() => {
              setArmado(false);
              executar(() => alternarDelivery(!aceita));
            }}
          >
            {aceita ? "Confirmar a pausa" : "Confirmar"}
          </Button>
          <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setArmado(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button type="button" variant="outline" className="ml-auto h-11 sm:h-9" disabled={pendente} onClick={() => setArmado(true)}>
          {aceita ? (
            <>
              <Pause aria-hidden /> Pausar o delivery
            </>
          ) : (
            <>
              <Play aria-hidden /> Voltar a receber pedidos
            </>
          )}
        </Button>
      )}
    </div>
  );
}
