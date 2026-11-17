import { z } from "zod";

import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createPublicClient } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

// O cliente do delivery cancela o próprio pedido enquanto o restaurante não aceitou (sem conta: o id
// do pedido é a senha, como no acompanhamento). O banco confere o status.
const semCache = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: pedidoId } = await params;
  if (!id.safeParse(pedidoId).success) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });
  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`pedido:cancelar:${ip}`, 20, 10 * 60_000)) {
    return Response.json({ erro: "Muitas tentativas. Aguarde um pouco." }, { status: 429, headers: semCache });
  }
  const corpo = z.object({ motivo: z.string().trim().max(300).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!corpo.success) return Response.json({ erro: "Motivo muito longo." }, { status: 400, headers: semCache });

  const { error } = await createPublicClient().rpc("cliente_cancelar_pedido", { p_pedido_id: pedidoId, p_motivo: corpo.data.motivo || undefined });
  if (error) return Response.json({ erro: error.code === "P0001" ? error.message : "Não foi possível cancelar. Tente de novo." }, { status: 400, headers: semCache });
  return Response.json({ ok: true }, { headers: semCache });
}
