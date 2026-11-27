"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { alternarPedidosDoSite } from "./actions";

const DESISTE_MS = 6000;

// Um botão só para suspender o site (decisão do dono em 27/11: "retirada e delivery são meio que
// um só"). Para quem está no caixa só existe uma pergunta — o site está recebendo ou não —, e a
// resposta vale para os dois jeitos de pedir.
//
// O que a casa oferece (entrega, retirada) é outra coisa, e fica em Painel › Restaurante: assim
// despausar devolve exatamente os jeitos que ela faz, sem ligar entrega para quem só faz balcão.
//
// Quieto quando está recebendo (uma linha, sem caixa); faixa de aviso quando está suspenso, que
// é quando vale ocupar espaço. Suspender pede confirmação no lugar — é o site saindo do ar.
export function ChaveDelivery({
  recebendo,
  podeMudar,
  className,
}: {
  recebendo: boolean;
  podeMudar: boolean;
  className?: string;
}) {
  const { executar, pendente } = useAcao();
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), DESISTE_MS);
    return () => clearTimeout(t);
  }, [armado]);

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        recebendo
          ? "text-muted-foreground"
          : "w-full rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 font-semibold text-amber-950",
        className,
      )}
    >
      <span className="flex items-center gap-2">
        {recebendo ? <span aria-hidden className="size-2.5 rounded-full bg-green-600" /> : <Pause className="size-4" aria-hidden />}
        {recebendo ? "O site está recebendo pedidos" : "Pedidos suspensos: o site não recebe nada"}
      </span>
      {!podeMudar ? null : armado ? (
        <span className="ml-auto flex items-center gap-1" role="group" aria-label="Suspender os pedidos do site">
          <Button
            type="button"
            variant="destructive"
            className="h-11 sm:h-9"
            disabled={pendente}
            onClick={() => {
              setArmado(false);
              executar(() => alternarPedidosDoSite(true));
            }}
          >
            Confirmar
          </Button>
          <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setArmado(false)}>
            Cancelar
          </Button>
        </span>
      ) : recebendo ? (
        <Button type="button" variant="outline" className="ml-auto h-11 sm:h-9" disabled={pendente} onClick={() => setArmado(true)}>
          <Pause aria-hidden /> Suspender pedidos
        </Button>
      ) : (
        <Button
          type="button"
          className="ml-auto h-11 sm:h-9"
          disabled={pendente}
          onClick={() => executar(() => alternarPedidosDoSite(false))}
        >
          <Play aria-hidden /> Voltar a receber
        </Button>
      )}
    </div>
  );
}
