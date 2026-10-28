"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createPublicClient } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

import { buscarMesaPorQr, buscarRestaurantePorSlug } from "../../dados";

const pedidoSchema = z.object({
  token: id,
  lote: id,
  total: z.number().int().min(0),
  itens: z
    .array(
      z.object({
        produto_id: id,
        quantidade: z.number().int().min(1).max(20),
        observacao: z.string().trim().max(200),
        adicionais: z.array(id).max(30),
      }),
    )
    .min(1, "Seu pedido está vazio.")
    .max(30),
});
export type PedidoMesa = z.input<typeof pedidoSchema>;

export type ResultadoPedidoMesa = { ok: true; numero: number } | { ok: false; mensagem: string; atualizar?: boolean };

// Cliente na mesa (QR code) manda o pedido: vai direto para a comanda da mesa e para a cozinha.
// O banco confere tudo (pedido ligado, caixa aberto, preços, opções, limite por mesa).
export async function pedirPelaMesa(slug: string, entrada: PedidoMesa): Promise<ResultadoPedidoMesa> {
  const dados = pedidoSchema.safeParse(entrada);
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Confira o pedido." };
  const d = dados.data;

  // A mesa precisa ser do restaurante do endereço (o código não serve em outro site).
  const [restaurante, mesa] = await Promise.all([buscarRestaurantePorSlug(slug), buscarMesaPorQr(d.token)]);
  if (!restaurante || !mesa || mesa.restauranteId !== restaurante.id) {
    return { ok: false, mensagem: "Este QR code não vale mais. Chame o garçom." };
  }

  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`mesa:${ip}`, 20, 10 * 60_000)) {
    return { ok: false, mensagem: "Muitos pedidos seguidos. Chame o garçom." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("pedir_pela_mesa", {
    p_token: d.token,
    p_itens: d.itens,
    p_lote: d.lote,
    p_total_esperado: d.total,
  });
  if (error) {
    const atualizar = /\((precos_mudaram|indisponivel)\)$/.test(error.message);
    const mensagem = error.code === "P0001" ? error.message.replace(/\s*\((precos_mudaram|indisponivel)\)$/, "") : "Não foi possível enviar. Tente de novo.";
    return { ok: false, mensagem, atualizar };
  }
  refresh();
  return { ok: true, numero: (data as { numero: number }).numero };
}
