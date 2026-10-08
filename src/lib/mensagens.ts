import "server-only";

// Envio do código de acesso do cliente (entrar com o telefone).
// O Supabase gera o código e chama /api/auth/enviar-codigo; aqui só entregamos a mensagem.
//
// MENSAGENS_PROVEDOR escolhe quem entrega:
//   - "console": só escreve no log do servidor (desenvolvimento; padrão fora de produção).
//   - vazio em produção: recusa (o cliente vê "não foi possível enviar o código").
// Para ligar um provedor de WhatsApp/SMS, acrescente um caso abaixo com as variáveis dele.
//
// A mensagem não cita a marca da plataforma (white label) e serve para qualquer restaurante.

export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string };

export function textoCodigo(codigo: string) {
  return `Seu código de acesso é ${codigo}. Ele vale por poucos minutos. Não passe este código para ninguém.`;
}

function provedorAtual() {
  return process.env.MENSAGENS_PROVEDOR || (process.env.NODE_ENV === "production" ? "" : "console");
}

// Sem provedor ou sem o segredo do gancho, o site esconde o "Entrar" (pedir sem conta continua).
export function loginClienteDisponivel(): boolean {
  return Boolean(provedorAtual() && process.env.SEND_SMS_HOOK_SECRET);
}

export async function enviarCodigo(telefone: string, codigo: string): Promise<ResultadoEnvio> {
  const provedor = provedorAtual();

  switch (provedor) {
    case "console":
      console.info(`[código de acesso] +${telefone.replace(/\D/g, "")}: ${codigo}`);
      return { ok: true };
    default:
      return { ok: false, motivo: provedor ? `Provedor de mensagens desconhecido: ${provedor}` : "Nenhum provedor de mensagens configurado." };
  }
}
