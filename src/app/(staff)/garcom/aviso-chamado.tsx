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
// Até ele responder: vibra a cada 3 s e bipa a cada 6 s.
const VIBRAR_MS = 3_000;

type Chamado = { id: string; recado: string | null; chamado_por: string | null; criado_em?: string };

// Chamado pelo painel: vibração, bipe e aviso na tela sem parar até o garçom tocar em "Vou"
// (ou fechar o aviso, ou responder em outro aparelho, ou o chamado vencer).
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

  const alertar = useCallback((bipar: boolean) => {
    navigator.vibrate?.([700, 300, 700]);
    if (bipar && audio.current?.state === "running") tocarAlerta(audio.current);
  }, []);

  const encerrar = useCallback((chamadoId: string) => {
    clearInterval(abertos.current.get(chamadoId));
    abertos.current.delete(chamadoId);
    navigator.vibrate?.(0);
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

      const vence = (chamado.criado_em ? new Date(chamado.criado_em).getTime() : Date.now()) + VALIDADE_MS;
      const idAviso = `chamado-${chamado.id}`;
      let vezes = 0;
      const intervalo = window.setInterval(() => {
        if (Date.now() > vence) {
          encerrar(chamado.id);
          toast.dismiss(idAviso);
          return;
        }
        vezes += 1;
        alertar(vezes % 2 === 0);
      }, VIBRAR_MS);
      abertos.current.set(chamado.id, intervalo);
      alertar(true);

      toast.warning(`${quem} está chamando você`, {
        id: idAviso,
        description: chamado.recado ?? undefined,
        duration: Infinity,
        // Botão grande: o garçom responde com uma mão.
        classNames: { actionButton: "!h-11 !rounded-full !px-6 !text-base !font-semibold" },
        action: {
          label: "Vou",
          onClick: (evento) => {
            // O aviso (e a vibração) só some quando o "Vou" chega ao sistema; sem internet, continua.
            evento.preventDefault();
            executar(
              () => atenderChamado(chamado.id),
              () => {
                encerrar(chamado.id);
                toast.dismiss(idAviso);
              },
            );
          },
        },
        onDismiss: () => encerrar(chamado.id),
      });
    },
    [alertar, encerrar, executar],
  );

  // Chamados que chegaram com o app fechado (ou durante uma queda de conexão).
  const conferir = useCallback(async () => {
    const { data } = await createClient()
      .from("chamados_garcom")
      .select("id, recado, chamado_por, criado_em")
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

  // Respondido em outro aparelho dele: para de vibrar aqui também.
  useMudancasRealtime(
    restauranteId,
    ["chamados_garcom"],
    (mudanca) => {
      const c = mudanca.new as { id?: string; garcom_id?: string; atendido_em?: string | null };
      if (!c.id || c.garcom_id !== membroId || !c.atendido_em || !abertos.current.has(c.id)) return;
      encerrar(c.id);
      toast.dismiss(`chamado-${c.id}`);
    },
    "UPDATE",
  );

  return null;
}
