"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

export function BotaoEnviar({
  children,
  pendente = "Salvando...",
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendente?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant} size={size}>
      {pending ? pendente : children}
    </Button>
  );
}

export function ErroCampo({ estado, campo }: { estado: ResultadoAcao; campo: string }) {
  const mensagem = estado?.erros?.[campo];
  if (!mensagem) return null;
  return (
    <p id={`erro-${campo}`} className="text-sm text-destructive">
      {mensagem}
    </p>
  );
}

// Valor inicial de um campo: o que foi enviado (se a ação falhou) ou o valor salvo.
export function valorCampo(estado: ResultadoAcao, campo: string, padrao: string | number | null | undefined): string {
  return estado?.valores?.[campo] ?? (padrao === null || padrao === undefined ? "" : String(padrao));
}

// Idem para checkbox: depois de uma falha, marcado = veio "on" no envio.
export function marcadoCampo(estado: ResultadoAcao, campo: string, padrao: boolean): boolean {
  return estado?.valores ? estado.valores[campo] === "on" : padrao;
}

// Mostra um aviso a cada novo resultado de Server Action.
export function useAvisoResultado(estado: ResultadoAcao) {
  useEffect(() => {
    if (!estado?.mensagem) return;
    if (estado.ok) toast.success(estado.mensagem);
    else toast.error(estado.mensagem);
  }, [estado]);
}

export function Campo({
  rotulo,
  htmlFor,
  children,
  className,
  dica,
}: {
  rotulo: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
  dica?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {rotulo}
      </label>
      {children}
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

// <select> nativo: melhor no celular e acessível por padrão.
export function Selecao({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
