import "server-only";

import { type AdicionalEscolhido, lerAdicionais } from "@/lib/adicionais";
import { createClient } from "@/lib/supabase/server";

export type ItemTicket = {
  id: string;
  quantidade: number;
  nome: string;
  adicionais: AdicionalEscolhido[];
  observacao: string | null;
  cancelado: boolean;
};

// Um ticket = os itens de um pedido para uma praça.
export type Ticket = {
  id: string;
  status: "pendente" | "pronto";
  criadoEm: string;
  prontoEm: string | null;
  praca: { id: string; nome: string };
  pedido: {
    numero: number;
    origem: "mesa" | "delivery" | "balcao";
    mesa: string | null;
    autor: string | null;
    cliente: string | null;
    observacao: string | null;
  };
  itens: ItemTicket[];
};

const CAMPOS = `id, status, criado_em, pronto_em, estacao_id,
  praca:estacoes!tarefas_producao_restaurante_id_estacao_id_fkey(id, nome),
  pedido:pedidos!tarefas_producao_restaurante_id_pedido_id_fkey(
    numero, origem, status, cliente_nome, observacao,
    comanda:comandas!pedidos_restaurante_id_comanda_id_fkey(mesa:mesas!comandas_restaurante_id_mesa_id_fkey(numero)),
    autor:membros!pedidos_restaurante_id_criado_por_fkey(nome),
    itens_pedido(id, quantidade, nome_produto, adicionais, observacao, cancelado_em, estacao_id, criado_em)
  )`;

// Pendentes (todas) + prontas nas últimas 3 horas, para desfazer um "pronto" por engano.
export async function carregarTickets(
  restauranteId: string,
): Promise<{ pendentes: Ticket[]; prontos: Ticket[]; geradoEm: number }> {
  const supabase = await createClient();
  const geradoEm = Date.now();
  const desde = new Date(geradoEm - 3 * 60 * 60 * 1000).toISOString();
  const [pendentes, prontos] = await Promise.all([
    supabase.from("tarefas_producao").select(CAMPOS).eq("restaurante_id", restauranteId).eq("status", "pendente").order("criado_em"),
    supabase
      .from("tarefas_producao")
      .select(CAMPOS)
      .eq("restaurante_id", restauranteId)
      .eq("status", "pronto")
      .gte("pronto_em", desde)
      .order("pronto_em", { ascending: false })
      .limit(12),
  ]);
  if (pendentes.error) throw new Error(pendentes.error.message);
  if (prontos.error) throw new Error(prontos.error.message);

  const montar = (linhas: NonNullable<typeof pendentes.data>): Ticket[] =>
    linhas.flatMap((t): Ticket[] => {
      const p = t.pedido;
      if (!p || !t.praca || p.status === "cancelado") return [];
      // Delivery só entra na cozinha depois que o caixa aceita.
      if (p.origem === "delivery" && p.status === "recebido") return [];
      const itens = p.itens_pedido
        .filter((i) => i.estacao_id === t.estacao_id)
        .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
        .map((i) => ({
          id: i.id,
          quantidade: i.quantidade,
          nome: i.nome_produto,
          adicionais: lerAdicionais(i.adicionais),
          observacao: i.observacao,
          cancelado: i.cancelado_em !== null,
        }));
      return [
        {
          id: t.id,
          status: t.status as Ticket["status"],
          criadoEm: t.criado_em,
          prontoEm: t.pronto_em,
          praca: { id: t.praca.id, nome: t.praca.nome },
          pedido: {
            numero: p.numero,
            origem: p.origem as Ticket["pedido"]["origem"],
            mesa: p.comanda?.mesa?.numero ?? null,
            autor: p.autor?.nome ?? null,
            cliente: p.cliente_nome,
            observacao: p.observacao,
          },
          itens,
        },
      ];
    });

  return { pendentes: montar(pendentes.data), prontos: montar(prontos.data), geradoEm };
}

export async function carregarPracasAtivas(restauranteId: string): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estacoes")
    .select("id, nome")
    .eq("restaurante_id", restauranteId)
    .eq("ativa", true)
    .order("ordem");
  if (error) throw new Error(error.message);
  return data;
}
