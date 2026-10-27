import { z } from "zod";

import { avisarInscricaoNova, chavePublicaAvisos, enderecoDeAvisoValido } from "@/lib/avisos-push";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createAdminClient } from "@/lib/supabase/admin";
import { id } from "@/lib/validacao";

// O navegador do cliente (anônimo) pede para ser avisado de um pedido. Quem tem o link do pedido
// pode ligar ou desligar os avisos dele; nada do pedido é devolvido por aqui.
const inscricao = z.object({
  endpoint: z.string().max(1000).refine(enderecoDeAvisoValido, "Endereço de aviso inválido."),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  // Falso quando o site liga sozinho (o cliente já tinha ligado antes): sem aviso de teste.
  teste: z.boolean().optional(),
});
const MAXIMO_POR_PEDIDO = 5;

const resposta = (status: number, erro?: string) => (erro ? Response.json({ erro }, { status }) : new Response(null, { status }));

async function pedidoEmAndamento(pedidoId: string) {
  const admin = createAdminClient();
  if (!admin || !chavePublicaAvisos()) return { admin: null, pedido: null };
  const { data: pedido } = await admin
    .from("pedidos")
    .select("id, restaurante_id, origem, status")
    .eq("id", pedidoId)
    .maybeSingle();
  const ok = pedido && pedido.origem === "delivery" && pedido.status !== "entregue" && pedido.status !== "cancelado";
  return { admin, pedido: ok ? pedido : null };
}

export async function POST(request: Request, ctx: RouteContext<"/api/pedidos/[id]/avisos">) {
  const { id: pedidoId } = await ctx.params;
  if (!id.safeParse(pedidoId).success) return resposta(404, "Pedido não encontrado.");
  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`avisos:${ip}`, 20, 10 * 60_000)) return resposta(429, "Muitas tentativas. Aguarde um pouco.");

  const dados = inscricao.safeParse(await request.json().catch(() => null));
  if (!dados.success) return resposta(400, "Este navegador não pode receber avisos.");

  const { admin, pedido } = await pedidoEmAndamento(pedidoId);
  if (!admin || !pedido) return resposta(404, "Pedido não encontrado ou já finalizado.");

  const { count } = await admin
    .from("pedidos_avisos")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", pedido.restaurante_id)
    .eq("pedido_id", pedido.id);
  if ((count ?? 0) >= MAXIMO_POR_PEDIDO) return resposta(409, "Este pedido já tem avisos em muitos aparelhos.");

  const { error } = await admin.from("pedidos_avisos").upsert(
    {
      restaurante_id: pedido.restaurante_id,
      pedido_id: pedido.id,
      endpoint: dados.data.endpoint,
      p256dh: dados.data.keys.p256dh,
      auth: dados.data.keys.auth,
    },
    { onConflict: "pedido_id,endpoint" },
  );
  if (error) return resposta(500, "Não foi possível ligar os avisos.");
  // Aviso de teste na hora: o cliente vê se o celular recebe.
  if (dados.data.teste === false) return Response.json({ enviado: false });
  const enviado = await avisarInscricaoNova(pedido.id, {
    endpoint: dados.data.endpoint,
    p256dh: dados.data.keys.p256dh,
    auth: dados.data.keys.auth,
  });
  return Response.json({ enviado });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/pedidos/[id]/avisos">) {
  const { id: pedidoId } = await ctx.params;
  if (!id.safeParse(pedidoId).success) return resposta(404);
  const dados = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  const admin = createAdminClient();
  if (!dados.success || !admin) return resposta(400);
  await admin.from("pedidos_avisos").delete().eq("pedido_id", pedidoId).eq("endpoint", dados.data.endpoint);
  return resposta(204);
}
