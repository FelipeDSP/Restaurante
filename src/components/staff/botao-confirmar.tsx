"use client";

import { Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const DESISTE_MS = 6000;

// Ação destrutiva em dois toques: o primeiro mostra "Confirmar"/"Cancelar" no lugar.
// Sem confirmar em alguns segundos, volta ao normal (um toque sem querer não fica armado).
export function BotaoConfirmar({
  rotulo,
  confirmar = "Confirmar exclusão",
  aoConfirmar,
  desabilitado,
  titulo,
  icone = true,
  children,
  className,
}: {
  // Nome acessível do botão inicial (ex.: "Excluir mesa 5").
  rotulo: string;
  confirmar?: string;
  aoConfirmar: () => void;
  desabilitado?: boolean;
  titulo?: string;
  // true: só a lixeira; false: usa `children` como texto.
  icone?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), DESISTE_MS);
    return () => clearTimeout(t);
  }, [armado]);

  if (armado) {
    return (
      <span className="flex items-center gap-1" role="group" aria-label={rotulo}>
        <Button
          type="button"
          variant="destructive"
          className="h-11 sm:h-9"
          disabled={desabilitado}
          onClick={() => {
            setArmado(false);
            aoConfirmar();
          }}
        >
          {confirmar}
        </Button>
        <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setArmado(false)}>
          Cancelar
        </Button>
      </span>
    );
  }

  return icone ? (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className ?? "size-11 sm:size-9"}
      aria-label={rotulo}
      title={titulo}
      disabled={desabilitado}
      onClick={() => setArmado(true)}
    >
      <Trash2 />
    </Button>
  ) : (
    <Button type="button" variant="outline" className={className} title={titulo} disabled={desabilitado} onClick={() => setArmado(true)}>
      {children}
    </Button>
  );
}
