import "server-only";

import { loginSmsDisponivel } from "@/lib/mensagens";

// Formas de o cliente do delivery entrar (conta opcional; pedir sem conta continua igual).
// - Código por e-mail: sempre (o Supabase envia pelo SMTP configurado nele).
// - Google: quando o provedor está ligado no Supabase e `LOGIN_GOOGLE=1` no servidor.
// - Celular (SMS): quando há provedor de mensagens (`MENSAGENS_PROVEDOR` + segredo do gancho).
export type FormasDeEntrar = { email: true; google: boolean; sms: boolean };

export function formasDeEntrar(): FormasDeEntrar {
  return { email: true, google: process.env.LOGIN_GOOGLE === "1", sms: loginSmsDisponivel() };
}

// Mostra o "Entrar" no site (sempre há o e-mail).
export function loginClienteDisponivel(): boolean {
  return true;
}
