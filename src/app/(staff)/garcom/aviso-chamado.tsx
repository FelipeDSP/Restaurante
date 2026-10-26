"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAcao } from "@/components/staff/acoes-cliente";
import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

import { atenderChamado } from "./actions";

// Chamados ainda valem por 30 min (depois disso não fazem mais sentido na tela).
const VALIDADE_MS = 30 * 60_000;
// Enquanto ele não responde, vibra e bipa de novo (algumas vezes).
const REPETIR_MS = 20_000;
const REPETICOES = 4;

type Chamado = { id: string; recado: string | null; chamado_por: string | null };

// Chamado do dono/caixa pelo painel: vibração, bipe e aviso na tela até o garçom tocar em "Vou".
export function AvisoChamado({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
  const audio = useRef<AudioContext | null>(null);
  const abertos = useRef(new Map<string, number>());
  const { executar } = useAcao();

  // Navegadores só liberam som depois de um toque na página.
  useEffect(() => {
    const liberar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", liberar, { once: true });
    return () => window.removeEventListener("pointerdown", liberar);
  }, []);

  useEffect(() => {
    const repeticoes = abertos.current;
    return () => repeticoes.forEach((intervalo) => clearInterval(intervalo));
  }, []);

  const alertar = useCallback(() => {
    navigator.vibrate?.([400, 150, 400, 150, 400]);
    if (audio.current?.state === "running") tocarAlerta(audio.current);
  }, []);

  const mostrar = useCallback(
    async (chamado: Chamado) => {
      if (abertos.current.has(chamado.id)) return;
      let quem = "Caixa";
      if (chamado.chamado_por) {
        const { data } = await createClient().from("membros").select("nome").eq("id", chamado.chamado_por).maybeSingle();
        if (data?.nome) quem = data.nome;
      }
      if (abertos.current.has(chamado.id)) return;

      let vezes = 0;
      const intervalo = window.setInterval(() => {
        vezes += 1;
        if (vezes >= REPETICOES) clearInterval(intervalo);
        alertar();
      }, REPETIR_MS);
      abertos.current.set(chamado.id, intervalo);
      alertar();

      const encerrar = () => {
        clearInterval(intervalo);
        abertos.current.delete(chamado.id);
      };
      toast.warning(`${quem} está chamando você`, {
        id: `chamado-${chamado.id}`,
        description: chamado.recado ?? undefined,
        duration: Infinity,
        // Botão grande: o garçom responde com uma mão.
        classNames: { actionButton: "!h-11 !rounded-full !px-6 !text-base !font-semibold" },
        action: { label: "Vou", onClick: () => executar(() => atenderChamado(chamado.id), encerrar) },
        onDismiss: () => clearInterval(intervalo),
      });
    },
    [alertar, executar],
  );

  // Chamados que chegaram com o app fechado (ou durante uma queda de conexão).
  const conferir = useCallback(async () => {
    const { data } = await createClient()
      .from("chamados_garcom")
      .select("id, recado, chamado_por")
      .eq("restaurante_id", restauranteId)
      .eq("garcom_id", membroId)
      .is("atendido_em", null)
      .gte("criado_em", new Date(Date.now() - VALIDADE_MS).toISOString())
      .order("criado_em");
    (data ?? []).forEach((c) => void mostrar(c));
  }, [restauranteId, membroId, mostrar]);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  useMudancasRealtime(
    restauranteId,
    ["chamados_garcom"],
    (mudanca) => {
      const c = mudanca.new as Chamado & { garcom_id?: string };
      if (c.garcom_id === membroId) void mostrar(c);
    },
    "INSERT",
    () => void conferir(),
  );

  return null;
}
