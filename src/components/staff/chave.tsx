"use client";

import { useAcao } from "@/components/staff/acoes-cliente";
import type { ResultadoAcao } from "@/lib/acoes";
import { cn } from "@/lib/utils";

// Liga/desliga de um toque, com o estado à vista (não é checkbox de formulário: vale na hora).
// `aoMudar` é a Server Action do assunto, recebida por quem usa a chave.
export function Chave({
  ligado,
  rotulo,
  aoMudar,
  className,
}: {
  ligado: boolean;
  rotulo: string;
  aoMudar: (ligado: boolean) => Promise<ResultadoAcao>;
  className?: string;
}) {
  const { executar, pendente } = useAcao();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={pendente}
      onClick={() => executar(() => aoMudar(!ligado))}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left font-medium hover:bg-muted disabled:opacity-50 print:hidden",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          ligado ? "bg-[var(--cor-primaria-texto)]" : "bg-muted-foreground/30",
        )}
      >
        <span className={cn("size-5 rounded-full bg-white shadow-sm transition-transform", ligado ? "translate-x-5" : "translate-x-0")} />
      </span>
      {rotulo}
    </button>
  );
}
