import { z } from "zod";

import { autenticarAgente, respostaErro } from "@/lib/impressao/agente";
import { id } from "@/lib/validacao";

const corpoSchema = z.object({ ok: z.boolean(), erro: z.string().max(300).optional() });

// O app avisa o resultado de um trabalho: impresso, ou o erro (volta para a fila até 5 tentativas).
export async function POST(request: Request, ctx: RouteContext<"/api/agente/trabalhos/[id]">) {
  const auth = await autenticarAgente(request);
  if (!auth.ok) return respostaErro(auth.erro, auth.status);

  const { id: filaId } = await ctx.params;
  const corpo = corpoSchema.safeParse(await request.json().catch(() => null));
  if (!id.safeParse(filaId).success || !corpo.success) return respostaErro("Dados inválidos.", 400);

  const { error } = await auth.admin.rpc("agente_concluir", {
    p_agente_id: auth.agente.id,
    p_fila_id: filaId,
    p_ok: corpo.data.ok,
    p_erro: corpo.data.erro ?? undefined,
  });
  if (error) return respostaErro("Não foi possível registrar.", 500);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
