import { autenticarAgente, respostaErro } from "@/lib/impressao/agente";
import { type Codificacao, paraEscPos } from "@/lib/impressao/escpos";
import { montarDocumento } from "@/lib/impressao/tickets";

// O app chama a cada ~2 s: recebe os trabalhos já em bytes ESC/POS e a lista das suas impressoras.
export async function GET(request: Request) {
  const auth = await autenticarAgente(request);
  if (!auth.ok) return respostaErro(auth.erro, auth.status);
  const { admin, agente, restaurante } = auth;

  const [{ data: trabalhos, error }, { data: impressoras }] = await Promise.all([
    admin.rpc("agente_pegar_trabalhos", { p_agente_id: agente.id, p_limite: 5 }),
    admin
      .from("impressoras")
      .select("id, nome, conexao, endereco, porta, largura, codificacao, modo, ativa, agente_id")
      .eq("restaurante_id", agente.restauranteId)
      .order("nome"),
  ]);
  if (error) return respostaErro("Não foi possível ler a fila.", 500);

  const minhas = (impressoras ?? []).filter((i) => i.ativa && (!i.agente_id || i.agente_id === agente.id));
  const porId = new Map(minhas.map((i) => [i.id, i]));

  const saida = [];
  for (const t of trabalhos ?? []) {
    const imp = porId.get(t.impressora_id);
    try {
      const doc = imp ? await montarDocumento(admin, t, restaurante) : null;
      if (!imp || !doc) {
        // Nada a imprimir (pedido cancelado, item já tirado): fecha o trabalho sem papel.
        await admin.rpc("agente_concluir", { p_agente_id: agente.id, p_fila_id: t.id, p_ok: true });
        continue;
      }
      const largura = imp.largura === 58 ? 58 : 80;
      const impressora = { id: imp.id, nome: imp.nome, conexao: imp.conexao, endereco: imp.endereco, porta: imp.porta, modo: imp.modo, largura };
      // Modo driver: o app desenha o documento e imprime pelo Windows; senão, bytes ESC/POS prontos.
      saida.push(
        imp.modo === "driver"
          ? { id: t.id, tipo: t.tipo, impressora, documento: doc }
          : {
              id: t.id,
              tipo: t.tipo,
              impressora,
              dados: Buffer.from(paraEscPos(doc, { largura, codificacao: imp.codificacao as Codificacao })).toString("base64"),
            },
      );
    } catch (e) {
      await admin.rpc("agente_concluir", {
        p_agente_id: agente.id,
        p_fila_id: t.id,
        p_ok: false,
        p_erro: `Falha ao montar o ticket: ${e instanceof Error ? e.message : "erro"}`,
      });
    }
  }

  return Response.json(
    {
      restaurante: { nome: restaurante.nome },
      agente: { id: agente.id, nome: agente.nome },
      impressoras: minhas.map((i) => ({ id: i.id, nome: i.nome, conexao: i.conexao, endereco: i.endereco, porta: i.porta, modo: i.modo })),
      trabalhos: saida,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
