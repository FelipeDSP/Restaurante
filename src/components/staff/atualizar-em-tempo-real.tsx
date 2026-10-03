"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { type TabelaRealtime, useMudancasRealtime } from "@/lib/realtime";

// Escuta mudanças do restaurante e recarrega os dados da página (Server Components).
// A RLS vale no Realtime: só chegam eventos de linhas que o usuário pode ler.
export function AtualizarEmTempoReal({ restauranteId, tabelas }: { restauranteId: string; tabelas: TabelaRealtime[] }) {
  const router = useRouter();
  const agendado = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Vários eventos juntos (ex.: item + pedido + comanda) viram um único refresh.
  const atualizar = () => {
    clearTimeout(agendado.current);
    agendado.current = setTimeout(() => router.refresh(), 300);
  };

  useMudancasRealtime(restauranteId, tabelas, atualizar);

  useEffect(() => {
    // Celular bloqueado perde eventos: ao voltar para o app, recarrega.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    return () => {
      clearTimeout(agendado.current);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
    };
  }, [router]);

  return null;
}
