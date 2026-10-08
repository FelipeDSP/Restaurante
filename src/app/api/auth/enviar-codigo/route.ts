import { Webhook } from "standardwebhooks";

import { enviarCodigo } from "@/lib/mensagens";

// Gancho "Send SMS" do Supabase Auth: o Supabase gera o código do cliente (entrar com o telefone)
// e chama esta rota, assinada com SEND_SMS_HOOK_SECRET (formato "v1,whsec_..."); daqui sai a
// mensagem pelo provedor configurado em src/lib/mensagens.ts.
//
// Resposta de erro no formato que o Supabase repassa ao cliente.
function erro(status: number, mensagem: string) {
  return Response.json({ error: { http_code: status, message: mensagem } }, { status });
}

type Evento = { user?: { phone?: string }; sms?: { otp?: string } };

export async function POST(request: Request) {
  const segredo = process.env.SEND_SMS_HOOK_SECRET?.replace(/^v1,whsec_/, "");
  if (!segredo) {
    console.error("[enviar-codigo] SEND_SMS_HOOK_SECRET não configurado");
    return erro(500, "Envio de código indisponível.");
  }

  const corpo = await request.text();
  let evento: Evento;
  try {
    evento = new Webhook(segredo).verify(corpo, Object.fromEntries(request.headers)) as Evento;
  } catch {
    return erro(401, "Assinatura inválida.");
  }

  const telefone = evento.user?.phone;
  const codigo = evento.sms?.otp;
  if (!telefone || !codigo) return erro(400, "Evento sem telefone ou código.");

  const resultado = await enviarCodigo(telefone, codigo);
  if (!resultado.ok) {
    console.error(`[enviar-codigo] ${resultado.motivo}`);
    return erro(500, "Não foi possível enviar o código.");
  }
  return Response.json({});
}
