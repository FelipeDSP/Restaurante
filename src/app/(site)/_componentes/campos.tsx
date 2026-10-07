"use client";

import { useFormStatus } from "react-dom";

import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

// Campos de formulário das páginas do produto (cadastro e primeiros passos).

export const classeEntrada =
  "h-12 w-full rounded-xl border-2 border-uau-borda bg-white px-4 text-base font-semibold text-uau-marrom outline-none transition-colors placeholder:font-normal placeholder:text-uau-marrom-claro/60 focus:border-uau-marrom aria-invalid:border-red-600";

export function CampoUau({
  id,
  rotulo,
  dica,
  estado,
  children,
  className,
}: {
  id: string;
  rotulo: string;
  dica?: React.ReactNode;
  estado?: ResultadoAcao;
  children: React.ReactNode;
  className?: string;
}) {
  const erro = estado?.erros?.[id];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-extrabold">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p id={`erro-${id}`} className="text-sm font-bold text-red-700">
          {erro}
        </p>
      ) : dica ? (
        <div className="text-sm text-uau-marrom-claro">{dica}</div>
      ) : null}
    </div>
  );
}

// Props de acessibilidade para o input do campo com erro.
export function propsErro(estado: ResultadoAcao, id: string) {
  const erro = estado?.erros?.[id];
  return erro ? { "aria-invalid": true as const, "aria-describedby": `erro-${id}` } : {};
}

export function BotaoEnviarUau({ children, pendente, className }: { children: React.ReactNode; pendente: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-14 items-center justify-center rounded-full bg-uau-laranja px-8 text-lg font-extrabold text-uau-marrom shadow-[0_5px_0_0_var(--color-uau-marrom)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_7px_0_0_var(--color-uau-marrom)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-uau-laranja active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-uau-marrom)] disabled:translate-y-0 disabled:opacity-70 disabled:shadow-[0_5px_0_0_var(--color-uau-marrom)]",
        className,
      )}
    >
      {pending ? pendente : children}
    </button>
  );
}

export function AvisoErro({ estado }: { estado: ResultadoAcao }) {
  if (!estado || estado.ok || !estado.mensagem) return null;
  return (
    <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
      {estado.mensagem}
    </p>
  );
}
