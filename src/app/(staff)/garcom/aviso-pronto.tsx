"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

// Avisa o garçom quando a cozinha termina um pedido das mesas dele (todas as praças prontas):
// aviso que fica na tela até ele tocar, vibração e bipe. Mesas sem garçom definido avisam todos.
export function AvisoPronto({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
  const router = useRouter();
  const audio = useRef<AudioContext | null>(null);
  const avisados = useRef(new Set<string>());

  // Navegadores só liberam som depois de um toque na página.
  useEffect(() => {
    const liberar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", liberar, { once: true });
    return () => window.removeEventListener("pointerdown", liberar);
  }, []);

  useMudancasRealtime(
    restauranteId,
    ["tarefas_producao"],
    async (mudanca) => {
      const tarefa = mudanca.new as { pedido_id?: string; status?: string };
      if (tarefa.status !== "pronto" || !tarefa.pedido_id || avisados.current.has(tarefa.pedido_id)) return;

      const supabase = createClient();
      const { data: pedido } = await supabase
        .from("pedidos")
        .select("numero, origem, comanda:comandas(garcom_id, mesa_id, mesa:mesas(numero)), tarefas_producao(status)")
        .eq("id", tarefa.pedido_id)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      if (!pedido || pedido.origem !== "mesa" || !pedido.comanda) return;
      if (pedido.tarefas_producao.some((t) => t.status === "pendente")) return; // ainda falta praça
      if (pedido.comanda.garcom_id && pedido.comanda.garcom_id !== membroId) return;
      if (avisados.current.has(tarefa.pedido_id)) return;
      avisados.current.add(tarefa.pedido_id);

      const mesaId = pedido.comanda.mesa_id;
      navigator.vibrate?.([300, 150, 300]);
      if (audio.current?.state === "running") tocarAlerta(audio.current);
      toast.success(`Mesa ${pedido.comanda.mesa?.numero ?? ""}: pedido nº ${pedido.numero} pronto`, {
        description: "Pode levar para a mesa.",
        duration: Infinity,
        action: { label: "Ver mesa", onClick: () => router.push(`/garcom/mesas/${mesaId}`) },
        cancel: { label: "Ok", onClick: () => {} },
      });
    },
    "UPDATE",
  );

  return null;
}
