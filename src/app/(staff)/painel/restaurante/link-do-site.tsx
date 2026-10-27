"use client";

import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Endereço do site de delivery em destaque: abrir e copiar para mandar aos clientes.
export function LinkDoSite({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Segure no endereço para copiar.");
    }
  }

  return (
    <section
      aria-label="Meu site"
      className="flex flex-col gap-3 rounded-xl border-2 border-[var(--cor-primaria)] bg-[color-mix(in_oklab,var(--cor-primaria)_8%,transparent)] p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]">
          <Globe className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Meu site de delivery</p>
          <p className="truncate text-sm text-muted-foreground select-all">{url}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={copiar}>
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          Copiar link
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants(),
            "h-11 flex-1 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90 sm:flex-none",
          )}
        >
          <ExternalLink aria-hidden />
          Abrir meu site
        </a>
      </div>
    </section>
  );
}
