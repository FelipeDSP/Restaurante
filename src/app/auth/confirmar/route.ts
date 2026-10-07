import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";

// Destino do link de confirmação de e-mail do Supabase Auth.
// Aceita os dois formatos: ?token_hash=&type= (template de e-mail) e ?code= (fluxo PKCE).
const TIPOS: EmailOtpType[] = ["signup", "email", "invite", "magiclink", "recovery", "email_change"];

function destinoSeguro(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/comecar";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const destino = destinoSeguro(searchParams.get("next"));
  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  let ok = false;
  if (tokenHash && tipo && TIPOS.includes(tipo)) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  // Origem pública (atrás do proxy, request.nextUrl pode ter o host interno do container).
  const origem = await origemDoSite();
  return NextResponse.redirect(new URL(ok ? destino : "/login?erro=link-invalido", origem));
}
