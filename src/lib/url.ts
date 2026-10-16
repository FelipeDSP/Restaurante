import "server-only";

import { headers } from "next/headers";

// Origem pública do site (ex.: https://uau.estudyou.com), usada em links de e-mail.
// Em produção, defina SITE_URL (lida em tempo de execução: trocar o domínio não exige build novo);
// NEXT_PUBLIC_SITE_URL fica como alternativa antiga. Sem nenhuma, usa o host da requisição.
export async function origemDoSite(): Promise<string> {
  const configurada = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/+$/, "");
  if (configurada) return configurada;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}`;
}

// "uaufoods.com.br" para exibir antes do /{slug}.
export async function dominioDoSite(): Promise<string> {
  return (await origemDoSite()).replace(/^https?:\/\//, "");
}
