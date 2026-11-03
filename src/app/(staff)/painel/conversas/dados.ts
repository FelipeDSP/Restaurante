import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dataHoraLocal, tempoDesde } from "@/lib/tempo";

import type { PedidoDelivery } from "../delivery/cartao-pedido";
import { carregarPedidosDelivery } from "../delivery/dados";

export type ItemConversa = {
  pedido: PedidoDelivery;
  ultima: { texto: string; autor: "cliente" | "equipe"; quando: string };
  naoLidas: number;
};

// "há 5 min" no mesmo dia; depois, dia e hora.
function quando(iso: string, fuso: string): string {
  return Date.now() - new Date(iso).getTime() < 12 * 60 * 60 * 1000 ? tempoDesde(iso) : dataHoraLocal(iso, fuso);
}

// Conversas dos últimos 7 dias, a mais recente primeiro (com o pedido no formato do cartão).
export async function carregarConversas(restauranteId: string, fuso: string): Promise<ItemConversa[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pedidos_mensagens")
    .select("pedido_id, autor, texto, criado_em, lida_em")
    .eq("restaurante_id", restauranteId)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  // A primeira de cada pedido é a última mensagem (ordem decrescente).
  const porPedido = new Map<string, { ultima: (typeof data)[number]; naoLidas: number }>();
  for (const m of data) {
    const item = porPedido.get(m.pedido_id) ?? { ultima: m, naoLidas: 0 };
    if (m.autor === "cliente" && !m.lida_em) item.naoLidas += 1;
    porPedido.set(m.pedido_id, item);
  }
  const ids = [...porPedido.keys()].slice(0, 50);
  if (ids.length === 0) return [];

  const pedidos = new Map((await carregarPedidosDelivery(restauranteId, fuso, { ids })).map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const pedido = pedidos.get(id);
    const c = porPedido.get(id);
    if (!pedido || !c) return [];
    return [
      {
        pedido,
        ultima: { texto: c.ultima.texto, autor: c.ultima.autor as "cliente" | "equipe", quando: quando(c.ultima.criado_em, fuso) },
        naoLidas: c.naoLidas,
      },
    ];
  });
}
