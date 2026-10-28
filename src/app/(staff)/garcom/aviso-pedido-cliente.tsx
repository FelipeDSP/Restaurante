"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAcao } from "@/components/staff/acoes-cliente";
import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

import { marcarPedidoVisto } from "./actions";

// Pedidos do cliente ainda não vistos aparecem de novo ao abrir o app, por até 30 min.
const VALIDADE_MS = 30 * 60_000;

type PedidoCliente = { id: string; comanda_id: string | null };

// O cliente pediu pelo QR code da mesa (já foi para a cozinha): aviso com os itens, para o garçom
// conferir (ex.: a bebida é agora ou com a comida). Só o garçom da mesa sente: vibra e bipa uma vez.
// Mesa sem garçom (o cliente abriu) aparece na tela de todos, sem vibrar (muitas mesas cansariam).
// "Ver pedido" grava quem viu e o aviso some nos outros aparelhos.
export function AvisoPedidoCliente({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
  const router = useRouter();
  const audio = useRef<AudioContext | null>(null);
  const mostrados = useRef(new Set<string>());
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

  const mostrar = useCallback(
    async (pedido: PedidoCliente, alertar: boolean) => {
      if (mostrados.current.has(pedido.id) || !pedido.comanda_id) return;
      const { data } = await createClient()
        .from("pedidos")
        .select(
          "visto_em, status, comanda:comandas(garcom_id, mesa_id, status, mesa:mesas(numero)), itens_pedido(nome_produto, quantidade, adicionais, observacao, etapas, servir_com_comida, cancelado_em)",
        )
        .eq("id", pedido.id)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      const comanda = data?.comanda;
      if (!data || data.visto_em || data.status === "cancelado" || !comanda) return;
      if (comanda.status !== "aberta" && comanda.status !== "conta_pedida") return;
      const daMinhaMesa = comanda.garcom_id === membroId;
      if (comanda.garcom_id && !daMinhaMesa) return;
      if (mostrados.current.has(pedido.id)) return;
      mostrados.current.add(pedido.id);

      const itens = data.itens_pedido
        .filter((i) => !i.cancelado_em)
        .map((i) => {
          const opcoes = Array.isArray(i.adicionais) ? (i.adicionais as { nome?: string }[]).map((a) => a.nome).filter(Boolean) : [];
          const semCozinha = !Array.isArray(i.etapas) || i.etapas.length === 0;
          const quando = semCozinha ? (i.servir_com_comida ? " · com a comida" : " · agora") : "";
          return `${i.quantidade}× ${i.nome_produto}${opcoes.length ? ` (${opcoes.join(", ")})` : ""}${i.observacao ? ` — ${i.observacao}` : ""}${quando}`;
        });

      if (alertar && daMinhaMesa) {
        navigator.vibrate?.([400, 150, 400]);
        if (audio.current?.state === "running") tocarAlerta(audio.current);
      }

      const idAviso = `pedido-cliente-${pedido.id}`;
      toast.info(`Mesa ${comanda.mesa?.numero ?? ""} pediu pelo celular`, {
        id: idAviso,
        description: (
          <span className="flex flex-col">
            {itens.map((linha, n) => (
              <span key={n}>{linha}</span>
            ))}
            {comanda.garcom_id ? null : <span className="mt-1 font-semibold">Mesa sem garçom</span>}
          </span>
        ),
        duration: Infinity,
        // Botão grande: o garçom responde com uma mão.
        classNames: { actionButton: "!h-11 !rounded-full !px-6 !text-base !font-semibold" },
        action: {
          label: "Ver pedido",
          onClick: (evento) => {
            evento.preventDefault();
            executar(
              () => marcarPedidoVisto(pedido.id),
              () => {
                toast.dismiss(idAviso);
                router.push(`/painel/comandas/${comanda.mesa_id}`);
              },
            );
          },
        },
      });
    },
    [restauranteId, membroId, executar, router],
  );

  // Pedidos que chegaram com o app fechado (ou durante uma queda de conexão): só na tela.
  const conferir = useCallback(async () => {
    const { data } = await createClient()
      .from("pedidos")
      .select("id, comanda_id")
      .eq("restaurante_id", restauranteId)
      .eq("origem", "mesa")
      .is("criado_por", null)
      .is("visto_em", null)
      .neq("status", "cancelado")
      .gte("criado_em", new Date(Date.now() - VALIDADE_MS).toISOString())
      .order("criado_em");
    (data ?? []).forEach((p) => void mostrar(p, false));
  }, [restauranteId, mostrar]);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const p = mudanca.new as { id?: string; origem?: string; criado_por?: string | null; comanda_id?: string | null };
      if (p.origem !== "mesa" || p.criado_por || !p.id) return;
      // O aviso chega depois do commit: os itens do pedido já estão gravados.
      void mostrar({ id: p.id, comanda_id: p.comanda_id ?? null }, true);
      router.refresh();
    },
    "INSERT",
    () => void conferir(),
  );

  // Visto em outro aparelho (ou por outro garçom) ou cancelado: o aviso some aqui também.
  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const p = mudanca.new as { id?: string; visto_em?: string | null; status?: string };
      if (!p.id || !mostrados.current.has(p.id)) return;
      if (p.visto_em || p.status === "cancelado") toast.dismiss(`pedido-cliente-${p.id}`);
    },
    "UPDATE",
  );

  return null;
}
