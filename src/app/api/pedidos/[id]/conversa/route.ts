import { z } from "zod";

import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createPublicClient } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

// Conversa do cliente do delivery com o restaurante (sem conta: o id do pedido é a senha, como no
// acompanhamento). GET lê, POST manda. O banco confere se a conversa está aberta e limita por pedido;
// aqui, mais um limite por IP.
const semCache = { "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: pedidoId } = await params;
  if (!id.safeParse(pedidoId).success) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });
  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`conversa:ler:${ip}`, 240, 10 * 60_000)) {
    return Response.json({ erro: "Muitas consultas." }, { status: 429, headers: semCache });
  }
  const { data, error } = await createPublicClient().rpc("conversa_pedido_publica", { p_pedido_id: pedidoId });
  if (error || !data) return Response.json({ erro: "Pedido não encontrado." }, { status: 404, headers: semCache });
  return Response.json(data, { headers: semCache });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: pedidoId } = await params;
  if (!id.safeParse(pedidoId).success) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });
  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`conversa:enviar:${ip}`, 30, 10 * 60_000)) {
    return Response.json({ erro: "Muitas mensagens. Aguarde a resposta do restaurante." }, { status: 429, headers: semCache });
  }
  const corpo = z.object({ texto: z.string().trim().min(1, "Escreva a mensagem.").max(1000, "Mensagem muito longa.") }).safeParse(await request.json().catch(() => null));
  if (!corpo.success) return Response.json({ erro: corpo.error.issues[0]?.message ?? "Mensagem inválida." }, { status: 400, headers: semCache });

  const { error } = await createPublicClient().rpc("cliente_enviar_mensagem", { p_pedido_id: pedidoId, p_texto: corpo.data.texto });
  if (error) return Response.json({ erro: error.code === "P0001" ? error.message : "Não foi possível enviar. Tente de novo." }, { status: 400, headers: semCache });
  return Response.json({ ok: true }, { headers: semCache });
}
