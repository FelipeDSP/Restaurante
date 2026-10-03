"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// O cliente é anônimo (sem Realtime): recarrega o status a cada intervalo enquanto o pedido está em andamento.
export function AtualizarPeriodicamente({ segundos, ativo }: { segundos: number; ativo: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!ativo) return;
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [segundos, ativo, router]);

  return null;
}
