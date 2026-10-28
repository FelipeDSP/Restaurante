"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAcao } from "@/components/staff/acoes-cliente";
import { useMudancasRealtime } from "@/lib/realtime";
import { tocarAlerta } from "@/lib/som";
import { createClient } from "@/lib/supabase/client";

import { marcarPedidoVisto } from "./actions";

// Depois disso o aviso não insiste mais (o pedido já foi servido ou a mesa resolveu com o garçom).
const VALIDADE_MS = 30 * 60_000;
// Até alguém ver: vibra a cada 3 s e bipa a cada 6 s.
const VIBRAR_MS = 3_000;

type PedidoCliente = { id: string; criado_em: string; comanda_id: string | null };

// O cliente pediu pelo QR code da mesa: o pedido já foi para a cozinha, mas o garçom precisa olhar
// (ex.: bebida, para perguntar se é para agora). O aviso mostra os itens e insiste até alguém tocar
// em "Ver pedido"; o banco guarda quem viu e o aviso some nos outros aparelhos. Vai para o garçom da
// mesa ou, com a mesa sem garçom (o cliente abriu), para todos.
export function AvisoPedidoCliente({ restauranteId, membroId }: { restauranteId: string; membroId: string }) {
  const router = useRouter();
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
    navigator.vibrate?.([400, 150, 400]);
    if (bipar && audio.current?.state === "running") tocarAlerta(audio.current);
  }, []);

  const encerrar = useCallback((pedidoId: string) => {
    clearInterval(abertos.current.get(pedidoId));
    abertos.current.delete(pedidoId);
    toast.dismiss(`pedido-cliente-${pedidoId}`);
  }, []);

  const mostrar = useCallback(
    async (pedido: PedidoCliente) => {
      if (abertos.current.has(pedido.id) || !pedido.comanda_id) return;
      const { data } = await createClient()
        .from("pedidos")
        .select(
          "visto_em, status, comanda:comandas(garcom_id, mesa_id, status, mesa:mesas(numero)), itens_pedido(nome_produto, quantidade, adicionais, observacao, cancelado_em)",
        )
        .eq("id", pedido.id)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      const comanda = data?.comanda;
      if (!data || data.visto_em || data.status === "cancelado" || !comanda) return;
      if (comanda.status !== "aberta" && comanda.status !== "conta_pedida") return;
      if (comanda.garcom_id && comanda.garcom_id !== membroId) return;
      if (abertos.current.has(pedido.id)) return;

      const itens = data.itens_pedido
        .filter((i) => !i.cancelado_em)
        .map((i) => {
          const opcoes = Array.isArray(i.adicionais) ? (i.adicionais as { nome?: string }[]).map((a) => a.nome).filter(Boolean) : [];
          return `${i.quantidade}× ${i.nome_produto}${opcoes.length ? ` (${opcoes.join(", ")})` : ""}${i.observacao ? ` — ${i.observacao}` : ""}`;
        });

      const vence = new Date(pedido.criado_em).getTime() + VALIDADE_MS;
      let vezes = 0;
      const intervalo = window.setInterval(() => {
        if (Date.now() > vence) {
          encerrar(pedido.id);
          return;
        }
        vezes += 1;
        alertar(vezes % 2 === 0);
      }, VIBRAR_MS);
      abertos.current.set(pedido.id, intervalo);
      alertar(true);

      toast.warning(`Mesa ${comanda.mesa?.numero ?? ""} pediu pelo celular`, {
        id: `pedido-cliente-${pedido.id}`,
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
            // O aviso (e a vibração) só some quando o "visto" chega ao sistema; sem internet, continua.
            evento.preventDefault();
            executar(
              () => marcarPedidoVisto(pedido.id),
              () => {
                encerrar(pedido.id);
                router.push(`/painel/comandas/${comanda.mesa_id}`);
              },
            );
          },
        },
        onDismiss: () => {
          clearInterval(abertos.current.get(pedido.id));
          abertos.current.delete(pedido.id);
        },
      });
    },
    [restauranteId, membroId, alertar, encerrar, executar, router],
  );

  // Pedidos que chegaram com o app fechado (ou durante uma queda de conexão).
  const conferir = useCallback(async () => {
    const { data } = await createClient()
      .from("pedidos")
      .select("id, criado_em, comanda_id")
      .eq("restaurante_id", restauranteId)
      .eq("origem", "mesa")
      .is("criado_por", null)
      .is("visto_em", null)
      .neq("status", "cancelado")
      .gte("criado_em", new Date(Date.now() - VALIDADE_MS).toISOString())
      .order("criado_em");
    (data ?? []).forEach((p) => void mostrar(p));
  }, [restauranteId, mostrar]);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const p = mudanca.new as { id?: string; origem?: string; criado_por?: string | null; criado_em?: string; comanda_id?: string | null };
      if (p.origem !== "mesa" || p.criado_por || !p.id) return;
      // O aviso chega depois do commit: os itens do pedido já estão gravados.
      void mostrar({ id: p.id, criado_em: p.criado_em ?? new Date().toISOString(), comanda_id: p.comanda_id ?? null });
      router.refresh();
    },
    "INSERT",
    () => void conferir(),
  );

  // Visto em outro aparelho (ou por outro garçom): para de insistir aqui também.
  useMudancasRealtime(
    restauranteId,
    ["pedidos"],
    (mudanca) => {
      const p = mudanca.new as { id?: string; visto_em?: string | null; status?: string };
      if (!p.id || !abertos.current.has(p.id)) return;
      if (p.visto_em || p.status === "cancelado") encerrar(p.id);
    },
    "UPDATE",
  );

  return null;
}
