"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { assinarPlano } from "./actions";

// "Assinar" um plano: na primeira vez pede o CPF ou CNPJ de quem paga; depois abre a fatura do
// Asaas (Pix, boleto ou cartão) nesta mesma aba.
export function BotaoAssinar({ plano, nome, pedirDocumento, rotulo }: { plano: string; nome: string; pedirDocumento: boolean; rotulo: string }) {
  const [pendente, iniciar] = useTransition();
  const [documento, setDocumento] = useState("");
  const [mostrarDocumento, setMostrarDocumento] = useState(false);

  function enviar() {
    if (pendente) return;
    if (pedirDocumento && !mostrarDocumento) {
      setMostrarDocumento(true);
      return;
    }
    iniciar(async () => {
      try {
        const r = await assinarPlano(plano, documento || undefined);
        if (!r.ok) {
          if (r.pedirDocumento) setMostrarDocumento(true);
          toast.error(r.mensagem);
          return;
        }
        if (r.url) {
          window.location.href = r.url;
        } else {
          toast.success(r.mensagem);
        }
      } catch {
        toast.error(mensagemFalhaRede());
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {mostrarDocumento ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          CPF ou CNPJ de quem paga
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            maxLength={18}
            className="h-11"
            autoFocus
          />
        </label>
      ) : null}
      <Button type="button" className="h-11 w-full" disabled={pendente} onClick={enviar} aria-label={`${rotulo} ${nome}`}>
        {pendente ? "Abrindo a fatura..." : mostrarDocumento ? "Continuar para o pagamento" : rotulo}
      </Button>
    </div>
  );
}
