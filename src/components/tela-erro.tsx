"use client";

import { WifiOff } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/conexao";

const NOVA_TENTATIVA_MS = 15_000;

// Conteúdo de error.tsx: texto em português, sem detalhes técnicos, e recuperação sozinha
// (quando a internet volta e, com rede, a cada 15 s). O error.tsx de cada área fica abaixo
// do layout dela, então o cabeçalho (e o alerta de pedidos do painel) continua na tela.
export function TelaErro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const online = useOnline();

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    window.addEventListener("online", retry);
    const intervalo = setInterval(() => {
      if (navigator.onLine) retry();
    }, NOVA_TENTATIVA_MS);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(intervalo);
    };
  }, [retry]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      {!online ? <WifiOff className="size-10 text-muted-foreground" aria-hidden /> : null}
      <h1 className="text-2xl font-semibold">{online ? "Não foi possível carregar esta tela" : "Sem internet"}</h1>
      <p className="text-muted-foreground" role="status">
        {online
          ? "Tentando de novo sozinho. Se continuar assim, confira a conexão."
          : "A tela volta sozinha quando a conexão voltar."}
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      <Button type="button" className="h-11" onClick={retry}>
        Tentar de novo agora
      </Button>
    </main>
  );
}
