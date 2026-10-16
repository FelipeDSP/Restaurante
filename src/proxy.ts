import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Endereço antigo gerado pelo Coolify (*.sslip.io): manda para o domínio oficial, mantendo o
// caminho (links antigos continuam valendo). O domínio oficial vem de SITE_URL, lida em tempo
// de execução no servidor (não é embutida no build).
function redirecionarEnderecoAntigo(request: NextRequest): NextResponse | null {
  const oficial = process.env.SITE_URL?.replace(/\/+$/, "");
  if (!oficial) return null;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0];
  if (!host.endsWith(".sslip.io") || host === new URL(oficial).hostname) return null;
  return NextResponse.redirect(new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, oficial), 308);
}

export async function proxy(request: NextRequest) {
  return redirecionarEnderecoAntigo(request) ?? updateSession(request);
}

export const config = {
  matcher: [
    // Ignora arquivos estáticos e imagens.
    "/((?!_next/static|_next/image|downloads/|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
