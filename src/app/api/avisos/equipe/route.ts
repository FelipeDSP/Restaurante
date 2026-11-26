import { z } from "zod";

import { avisarInscricaoNovaEquipe, chavePublicaAvisos, enderecoDeAvisoValido } from "@/lib/avisos-equipe";
import { obterContexto } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

// Ligar e desligar os avisos no celular de quem trabalha. O membro NUNCA vem do navegador: sai da
// sessão, senão qualquer um inscreveria o aparelho dele no nome de outra pessoa e receberia os
// chamados dela.
const inscricao = z.object({
  endpoint: z.string().max(1000).refine(enderecoDeAvisoValido, "Endereço de aviso inválido."),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  // Falso quando a página religa sozinha uma inscrição que já existia: sem aviso de teste.
  teste: z.boolean().optional(),
});

// Celular, tablet do salão, o computador de casa: alguns, não infinitos. O aparelho antigo que a
// pessoa não usa mais some sozinho quando o navegador cancela a inscrição (404/410 no envio).
const MAXIMO_POR_PESSOA = 6;

// O membro do restaurante ativo, pela sessão. Rota de API não redireciona: devolve null e o
// chamador responde 404.
async function membroDaSessao() {
  const { ativo } = await obterContexto();
  return ativo ? { membroId: ativo.membroId, restauranteId: ativo.restaurante.id } : null;
}

const resposta = (status: number, erro?: string) => (erro ? Response.json({ erro }, { status }) : new Response(null, { status }));

export async function POST(request: Request) {
  const membro = await membroDaSessao();
  const admin = createAdminClient();
  if (!membro || !admin || !chavePublicaAvisos()) return resposta(404, "Avisos indisponíveis.");

  const dados = inscricao.safeParse(await request.json().catch(() => null));
  if (!dados.success) return resposta(400, "Este navegador não pode receber avisos.");

  const { count } = await admin.from("membros_avisos").select("id", { count: "exact", head: true }).eq("membro_id", membro.membroId);
  if ((count ?? 0) >= MAXIMO_POR_PESSOA) return resposta(409, "Você já tem avisos ligados em muitos aparelhos.");

  const { error } = await admin.from("membros_avisos").upsert(
    {
      restaurante_id: membro.restauranteId,
      membro_id: membro.membroId,
      endpoint: dados.data.endpoint,
      p256dh: dados.data.keys.p256dh,
      auth: dados.data.keys.auth,
    },
    { onConflict: "membro_id,endpoint" },
  );
  if (error) return resposta(500, "Não foi possível ligar os avisos.");

  if (dados.data.teste !== false) {
    const chegou = await avisarInscricaoNovaEquipe(membro.membroId, { endpoint: dados.data.endpoint, p256dh: dados.data.keys.p256dh, auth: dados.data.keys.auth });
    if (!chegou) return resposta(502, "O aparelho aceitou, mas o aviso de teste não chegou. Tente de novo.");
  }
  return resposta(204);
}

export async function DELETE(request: Request) {
  const membro = await membroDaSessao();
  const admin = createAdminClient();
  if (!membro || !admin) return resposta(404, "Avisos indisponíveis.");
  const dados = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!dados.success) return resposta(400, "Endereço inválido.");
  // Pelo membro da sessão: ninguém desliga o aviso do aparelho de outra pessoa.
  await admin.from("membros_avisos").delete().eq("membro_id", membro.membroId).eq("endpoint", dados.data.endpoint);
  return resposta(204);
}
