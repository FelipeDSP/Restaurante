"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { type MudancaRealtime, type TabelaRealtime, useMudancasRealtime } from "@/lib/realtime";
import type { FiltroMudanca } from "@/lib/realtime-filtros";

// Janela curta para juntar os eventos de uma mesma ação (um lançamento gera 6 eventos no banco).
const JUNTAR_EVENTOS = 300;

// Escuta mudanças do restaurante e recarrega os dados da página (Server Components).
// A RLS vale no Realtime: só chegam eventos de linhas que o usuário pode ler.
export function AtualizarEmTempoReal({
  restauranteId,
  tabelas,
  interessa,
  espera = JUNTAR_EVENTOS,
}: {
  restauranteId: string;
  tabelas: TabelaRealtime[];
  // Olha a linha que mudou antes de recarregar: sem isto toda tela se refaz a cada evento do
  // restaurante inteiro. Em `src/lib/realtime-filtros.ts`; na dúvida, o filtro deixa passar.
  interessa?: FiltroMudanca;
  // Intervalo mínimo entre dois refreshes. Telas de dinheiro (Início, Caixa) refazem um resumo
  // caro a cada render, e um total que demora alguns segundos para mudar não atrapalha ninguém.
  espera?: number;
}) {
  const router = useRouter();
  const agendado = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimo = useRef(0);

  // Vários eventos juntos (ex.: item + pedido + comanda) viram um único refresh.
  //
  // `espera` é intervalo mínimo, não "esperar tudo parar": com evento chegando sem parar, um
  // debounce simples de 3 s nunca dispararia e a tela ficaria congelada justo no pico (medido:
  // 1 atualização em 20 s de movimento). Assim o primeiro evento atualiza em JUNTAR_EVENTOS e
  // os seguintes, no máximo uma vez a cada `espera`.
  const atualizar = (mudanca: MudancaRealtime) => {
    if (interessa && !interessa(mudanca)) return;
    clearTimeout(agendado.current);
    const faltaParaOIntervalo = ultimo.current === 0 ? 0 : Math.max(0, espera - (Date.now() - ultimo.current));
    agendado.current = setTimeout(
      () => {
        ultimo.current = Date.now();
        router.refresh();
      },
      Math.max(JUNTAR_EVENTOS, faltaParaOIntervalo),
    );
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
