"use client";

import { RotateCcw } from "lucide-react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { reimprimir } from "./actions";
import type { Impressao } from "./dados";

const TIPO: Record<Impressao["tipo"], string> = {
  producao: "Pedido da praça",
  conta: "Conta",
  delivery: "Via do delivery",
  cancelamento: "Cancelamento",
  teste: "Teste",
};

const STATUS: Record<Impressao["status"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Na fila", classe: "bg-amber-100 text-amber-900" },
  imprimindo: { rotulo: "Imprimindo", classe: "bg-sky-100 text-sky-900" },
  impresso: { rotulo: "Impresso", classe: "bg-green-100 text-green-800" },
  erro: { rotulo: "Erro", classe: "bg-red-100 text-red-800" },
};

export function Fila({ fila, fuso }: { fila: Impressao[]; fuso: string }) {
  const { pendente, executar } = useAcao();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas impressões</CardTitle>
        <CardDescription>Atualiza sozinho. Algo não saiu? Reimprima daqui.</CardDescription>
      </CardHeader>
      <CardContent>
        {fila.length === 0 ? (
          <p className="text-muted-foreground">Nada impresso ainda.</p>
        ) : (
          <ul className="divide-y">
            {fila.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="w-12 tabular-nums text-muted-foreground">{horaLocal(f.criadoEm, fuso)}</span>
                <span className="font-medium">{TIPO[f.tipo]}</span>
                <span className="text-muted-foreground">{f.impressora}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS[f.status].classe)}>{STATUS[f.status].rotulo}</span>
                {f.erro && f.status !== "impresso" ? (
                  <span className="text-red-800">
                    {f.erro}
                    {f.tentativas > 1 ? ` (tentativa ${f.tentativas})` : ""}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={pendente}
                  onClick={() => executar(() => reimprimir(f.id))}
                >
                  <RotateCcw />
                  Reimprimir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
