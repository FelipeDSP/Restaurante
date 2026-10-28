"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

// O cliente pediu pelo QR code da mesa: o pedido já foi para a cozinha; o garçom da mesa fica
// sabendo (vibração, bipe e aviso). Mesa sem garçom (o cliente abriu) avisa todos.
export function AvisoPedidoCliente({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
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
    ["pedidos"],
    async (mudanca) => {
      const novo = mudanca.new as { id?: string; origem?: string; criado_por?: string | null; comanda_id?: string | null };
      if (novo.origem !== "mesa" || novo.criado_por || !novo.id || !novo.comanda_id || avisados.current.has(novo.id)) return;

      const supabase = createClient();
      const { data: comanda } = await supabase
        .from("comandas")
        .select("garcom_id, mesa_id, mesa:mesas(numero)")
        .eq("id", novo.comanda_id)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      if (!comanda || (comanda.garcom_id && comanda.garcom_id !== membroId)) return;
      if (avisados.current.has(novo.id)) return;
      avisados.current.add(novo.id);

      navigator.vibrate?.([200, 100, 200, 100, 200]);
      if (audio.current?.state === "running") tocarAlerta(audio.current);
      toast.info(`Mesa ${comanda.mesa?.numero ?? ""} pediu pelo celular`, {
        description: comanda.garcom_id ? "Já foi para a cozinha." : "Já foi para a cozinha. A mesa está sem garçom.",
        duration: Infinity,
        action: { label: "Ver mesa", onClick: () => router.push(`/painel/comandas/${comanda.mesa_id}`) },
        cancel: { label: "Ok", onClick: () => {} },
      });
      router.refresh();
    },
    "INSERT",
  );

  return null;
}
