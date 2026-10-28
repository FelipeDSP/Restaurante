import { tokenWebhookValido } from "@/lib/asaas";
import { createAdminClient } from "@/lib/supabase/admin";

// Avisos do Asaas (pagamento confirmado, vencido, assinatura cancelada...). Configurar no Asaas:
// Integrações › Webhooks, URL <site>/api/asaas/webhook e o token igual a ASAAS_WEBHOOK_TOKEN.
// O banco registra cada aviso uma vez e atualiza a assinatura (processar_evento_asaas).
// Responder 200 rápido: com 15 falhas seguidas o Asaas pausa a fila.
export async function POST(request: Request) {
  if (!tokenWebhookValido(request.headers.get("asaas-access-token"))) {
    return new Response(null, { status: 401 });
  }
  const evento = await request.json().catch(() => null);
  if (!evento || typeof evento !== "object" || typeof evento.id !== "string" || typeof evento.event !== "string") {
    return new Response(null, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return new Response(null, { status: 503 });
  const { data, error } = await admin.rpc("processar_evento_asaas", { p_evento: evento });
  if (error) {
    // Erro do nosso lado: o Asaas tenta de novo depois.
    console.error("[asaas] webhook", evento.event, error.message);
    return new Response(null, { status: 500 });
  }
  if (data !== "repetido") console.info("[asaas] webhook", evento.event, data);
  return new Response(null, { status: 200 });
}
