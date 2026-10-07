import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

// O app de impressão não tem login de pessoa: fala com o servidor por uma chave própria,
// recebida no pareamento. O banco guarda só o hash do código e da chave.
// As rotas /api/agente usam a chave secreta do Supabase, sempre filtrando pelo agente autenticado.

export function hashDe(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function gerarCodigoPareamento(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function gerarChaveAgente(): string {
  return randomBytes(32).toString("base64url");
}

export { VALIDADE_CODIGO_MIN } from "./constantes";

// Agente da requisição (Authorization: Bearer <chave>), ativo e de restaurante ativo.
export async function autenticarAgente(request: Request) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, erro: "Servidor sem a chave do Supabase configurada.", status: 503 } as const;

  const chave = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!chave || chave.length < 20) return { ok: false, erro: "Não autorizado.", status: 401 } as const;

  const { data: agente } = await admin
    .from("agentes_impressao")
    .select("id, nome, restaurante_id, ativo, restaurante:restaurantes(nome, fuso_horario, ativo, excluido_em)")
    .eq("token_hash", hashDe(chave))
    .maybeSingle();
  const r = agente?.restaurante;
  if (!agente || !agente.ativo || !r || !r.ativo || r.excluido_em) return { ok: false, erro: "Não autorizado.", status: 401 } as const;

  return {
    ok: true,
    admin,
    agente: { id: agente.id, nome: agente.nome, restauranteId: agente.restaurante_id },
    restaurante: { nome: r.nome, fuso: r.fuso_horario },
  } as const;
}

export function respostaErro(erro: string, status: number) {
  return Response.json({ erro }, { status, headers: { "Cache-Control": "no-store" } });
}
