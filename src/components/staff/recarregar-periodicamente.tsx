"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Recarrega os dados da página de tempos em tempos (para o que muda sem evento no banco).
export function RecarregarPeriodicamente({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(intervalo);
  }, [router, segundos]);
  return null;
}
