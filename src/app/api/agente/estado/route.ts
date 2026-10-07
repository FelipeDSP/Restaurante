import { z } from "zod";

import { autenticarAgente, respostaErro } from "@/lib/impressao/agente";

const corpoSchema = z.object({
  versao: z.string().trim().max(40).optional(),
  impressorasWindows: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

// O app informa a versão e as impressoras instaladas no Windows (aparecem no painel para escolher).
export async function POST(request: Request) {
  const auth = await autenticarAgente(request);
  if (!auth.ok) return respostaErro(auth.erro, auth.status);
  const corpo = corpoSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return respostaErro("Dados inválidos.", 400);

  const { error } = await auth.admin
    .from("agentes_impressao")
    .update({
      ultimo_contato_em: new Date().toISOString(),
      ...(corpo.data.versao ? { versao: corpo.data.versao } : {}),
      ...(corpo.data.impressorasWindows ? { impressoras_windows: corpo.data.impressorasWindows } : {}),
    })
    .eq("id", auth.agente.id);
  if (error) return respostaErro("Não foi possível registrar.", 500);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
