"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// Imprime ou salva em PDF pelo navegador (para mostrar ou mandar ao cliente).
export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" className="h-11" onClick={() => window.print()}>
      <Printer />
      Imprimir ou salvar PDF
    </Button>
  );
}
