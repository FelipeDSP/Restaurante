"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Erro inesperado em qualquer página (texto em português, sem expor detalhes técnicos).
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Algo deu errado</h1>
      <p className="text-muted-foreground">
        Não foi possível carregar esta tela. Verifique a conexão e tente de novo.
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      <Button type="button" className="h-11" onClick={reset}>
        Tentar de novo
      </Button>
    </main>
  );
}
