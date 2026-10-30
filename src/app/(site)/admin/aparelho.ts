import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import type { createClient } from "@/lib/supabase/server";

// "Lembrar deste computador por 30 dias" no super admin: cookie com uma chave aleatória longa
// (o banco guarda só o hash, rest_privado.admin_aparelhos). Senha + cookie = sem pedir o código.
const COOKIE = "admin_aparelho";
const TRINTA_DIAS = 30 * 24 * 60 * 60;

type Cliente = Awaited<ReturnType<typeof createClient>>;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// "Chrome no Windows" etc., para reconhecer na lista (só informativo).
function nomeDoNavegador(ua: string): string {
  const navegador = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const sistema = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return sistema ? `${navegador} no ${sistema}` : navegador;
}

export async function lembrarAparelho(supabase: Cliente): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const nome = nomeDoNavegador((await headers()).get("user-agent") ?? "");
  const { error } = await supabase.rpc("admin_lembrar_aparelho", { p_token_hash: hash(token), p_nome: nome });
  if (error) return;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRINTA_DIAS,
  });
}

// Confirma a sessão atual (que só passou pela senha) se este computador foi lembrado por este admin.
export async function entrarPeloAparelho(supabase: Cliente): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 100) return false;
  const { data, error } = await supabase.rpc("admin_entrar_por_aparelho", { p_token_hash: hash(token) });
  return !error && data === true;
}

export async function esquecerCookieAparelho(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
