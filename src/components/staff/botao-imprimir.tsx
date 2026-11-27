"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Imprime (ou salva em PDF) pelo navegador: resumo do caixa, QR code das mesas, conta do
// Histórico. Eram três botões iguais em três telas; o rótulo é o que mudava.
export function BotaoImprimir({ rotulo = "Imprimir", className }: { rotulo?: string; className?: string }) {
  return (
    <Button type="button" variant="outline" className={cn("print:hidden", className)} onClick={() => window.print()}>
      <Printer />
      {rotulo}
    </Button>
  );
}
