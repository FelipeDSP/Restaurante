"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useMudancasRealtime } from "@/lib/realtime";
import { novoContextoDeSom, tocarAlerta } from "@/lib/som";
import { itensProntosParaLevar } from "@/lib/preparo";
import { createClient } from "@/lib/supabase/client";

// Avisa o garçom quando a cozinha termina itens das mesas dele (cada item quando a rota dele termina,
// sem esperar o resto do pedido):
// aviso que fica na tela até ele tocar, vibração e bipe. Mesa sem garçom aparece para todos, sem
// vibrar nem bipar (como o pedido pelo QR). Só com a mesa aberta e algum item valendo: fechar a
// mesa encerra os tickets pendentes (vira "pronto" no banco) e isso não é prato para levar.
// Na volta da conexão, confere o que ficou pronto nesse intervalo.
const RECENTES_MS = 30 * 60_000;

export function AvisoPronto({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
  const router = useRouter();
  const audio = useRef<AudioContext | null>(null);
  const avisados = useRef(new Set<string>());

  // Navegadores só liberam som depois de um toque na página.
  useEffect(() => {
    const liberar = () => {
      audio.current ??= novoContextoDeSom();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", liberar, { once: true });
    return () => window.removeEventListener("pointerdown", liberar);
  }, []);

  // Confere um pedido: avisa os itens que ficaram prontos e ainda não foram avisados.
  const conferirPedido = useCallback(
    async (pedidoId: string) => {
      const supabase = createClient();
      const { data: pedido } = await supabase
        .from("pedidos")
        .select(
          "numero, origem, status, comanda:comandas(garcom_id, mesa_id, status, mesa:mesas(numero)), tarefas_producao(estacao_id, ordem, status, pronto_em, retirada), itens_pedido(id, nome_produto, quantidade, etapas, cancelado_em, entregue_em)",
        )
        .eq("id", pedidoId)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      if (!pedido || pedido.origem !== "mesa" || !pedido.comanda || pedido.status === "cancelado") return;
      if (pedido.comanda.status !== "aberta" && pedido.comanda.status !== "conta_pedida") return; // mesa já encerrada
      if (pedido.comanda.garcom_id && pedido.comanda.garcom_id !== membroId) return;
      // Itens que ficaram prontos agora (cada um pelo próprio caminho: o espeto não espera o burger).
      const novos = itensProntosParaLevar(pedido.itens_pedido, pedido.tarefas_producao).filter((i) => !avisados.current.has(i.id));
      if (novos.length === 0) return;
      novos.forEach((i) => avisados.current.add(i.id));
      const faltam = pedido.tarefas_producao.some((t) => t.status === "pendente");

      const mesaId = pedido.comanda.mesa_id;
      if (pedido.comanda.garcom_id === membroId) {
        navigator.vibrate?.([300, 150, 300]);
        if (audio.current?.state === "running") tocarAlerta(audio.current);
      }
      toast.success(`Mesa ${pedido.comanda.mesa?.numero ?? ""}: ${faltam ? "parte do " : ""}pedido nº ${pedido.numero} pronto`, {
        description: `${novos.map((i) => `${i.quantidade}× ${i.nome_produto}`).join(", ")}. Pode levar para a mesa.`,
        duration: Infinity,
        action: { label: "Ver mesa", onClick: () => router.push(`/painel/comandas/${mesaId}`) },
        cancel: { label: "Ok", onClick: () => {} },
      });
    },
    [restauranteId, membroId, router],
  );

  // Queda de conexão: os tickets que ficaram prontos nesse meio tempo (ainda não retirados).
  const conferirRecentes = useCallback(async () => {
    const { data } = await createClient()
      .from("tarefas_producao")
      .select("pedido_id")
      .eq("restaurante_id", restauranteId)
      .eq("status", "pronto")
      .eq("retirada", false)
      .gte("pronto_em", new Date(Date.now() - RECENTES_MS).toISOString());
    new Set((data ?? []).map((t) => t.pedido_id)).forEach((id) => void conferirPedido(id));
  }, [restauranteId, conferirPedido]);

  useMudancasRealtime(
    restauranteId,
    ["tarefas_producao"],
    (mudanca) => {
      const tarefa = mudanca.new as { pedido_id?: string; status?: string; retirada?: boolean };
      // Retirado pelo garçom ("Retirei"): ele já está com o prato, não precisa de aviso.
      if (tarefa.status !== "pronto" || tarefa.retirada || !tarefa.pedido_id) return;
      void conferirPedido(tarefa.pedido_id);
    },
    "UPDATE",
    () => void conferirRecentes(),
  );

  return null;
}
