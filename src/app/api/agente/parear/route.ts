import { z } from "zod";

import { gerarChaveAgente, hashDe, respostaErro } from "@/lib/impressao/agente";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createAdminClient } from "@/lib/supabase/admin";

const corpoSchema = z.object({
  codigo: z.string().trim().regex(/^\d{6}$/, "Código de 6 dígitos."),
  versao: z.string().trim().max(40).optional(),
});

// Troca o código de 6 dígitos (gerado pelo dono no painel) pela chave do agente.
export async function POST(request: Request) {
  // Contra tentativa e erro: 10 tentativas a cada 10 minutos por IP.
  if (!consumirLimite(`parear:${await ipDoCliente()}`, 10, 10 * 60_000)) {
    return respostaErro("Muitas tentativas. Aguarde alguns minutos.", 429);
  }
  const corpo = corpoSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return respostaErro("Código inválido.", 400);

  const admin = createAdminClient();
  if (!admin) return respostaErro("Servidor sem a chave do Supabase configurada.", 503);

  const { data: agente } = await admin
    .from("agentes_impressao")
    .select("id, nome, restaurante:restaurantes(nome, ativo, excluido_em)")
    .eq("codigo_hash", hashDe(corpo.data.codigo))
    .gt("codigo_expira_em", new Date().toISOString())
    .eq("ativo", true)
    .maybeSingle();
  const r = agente?.restaurante;
  if (!agente || !r || !r.ativo || r.excluido_em) return respostaErro("Código inválido ou vencido. Gere outro no painel.", 404);

  const chave = gerarChaveAgente();
  const { error } = await admin
    .from("agentes_impressao")
    .update({
      token_hash: hashDe(chave),
      codigo_hash: null,
      codigo_expira_em: null,
      pareado_em: new Date().toISOString(),
      ultimo_contato_em: new Date().toISOString(),
      versao: corpo.data.versao ?? null,
    })
    .eq("id", agente.id);
  if (error) return respostaErro("Não foi possível parear. Tente de novo.", 500);

  return Response.json(
    { chave, agente: { id: agente.id, nome: agente.nome }, restaurante: { nome: r.nome } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
