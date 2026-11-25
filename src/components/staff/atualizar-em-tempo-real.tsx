"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { type MudancaRealtime, type TabelaRealtime, useMudancasRealtime } from "@/lib/realtime";
import type { FiltroMudanca } from "@/lib/realtime-filtros";

// Escuta mudanças do restaurante e recarrega os dados da página (Server Components).
// A RLS vale no Realtime: só chegam eventos de linhas que o usuário pode ler.
export function AtualizarEmTempoReal({
  restauranteId,
  tabelas,
  interessa,
  espera = 300,
}: {
  restauranteId: string;
  tabelas: TabelaRealtime[];
  // Olha a linha que mudou antes de recarregar: sem isto toda tela se refaz a cada evento do
  // restaurante inteiro. Em `src/lib/realtime-filtros.ts`; na dúvida, o filtro deixa passar.
  interessa?: FiltroMudanca;
  // Quanto esperar para juntar eventos. Telas de dinheiro (Início, Caixa) refazem um resumo
  // caro a cada render, e um atraso de alguns segundos num total não muda nada para quem olha.
  espera?: number;
}) {
  const router = useRouter();
  const agendado = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Vários eventos juntos (ex.: item + pedido + comanda) viram um único refresh.
  const atualizar = (mudanca: MudancaRealtime) => {
    if (interessa && !interessa(mudanca)) return;
    clearTimeout(agendado.current);
    agendado.current = setTimeout(() => router.refresh(), espera);
  };

  // Ao reconectar depois de uma queda, os eventos do intervalo se perderam: recarrega tudo.
  useMudancasRealtime(restauranteId, tabelas, atualizar, "*", () => router.refresh());

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
