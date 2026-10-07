import { consultarPedido } from "@/app/(publico)/[slug]/dados";
import { id } from "@/lib/validacao";

// Status do pedido de delivery para a tela de acompanhamento do cliente (anônimo).
// Mesmo conteúdo da RPC pública `consultar_pedido_publico`; só sai pedido de delivery.
export async function GET(_request: Request, ctx: RouteContext<"/api/pedidos/[id]">) {
  const { id: pedidoId } = await ctx.params;
  const semCache = { "Cache-Control": "no-store" };
  if (!id.safeParse(pedidoId).success) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });

  const pedido = await consultarPedido(pedidoId);
  if (!pedido) return Response.json({ erro: "Pedido não encontrado." }, { status: 404, headers: semCache });
  return Response.json(pedido, { headers: semCache });
}
