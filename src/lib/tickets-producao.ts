import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { type AdicionalEscolhido, lerAdicionais } from "@/lib/adicionais";
import type { Database } from "@/types/database";

// Ticket de praça (pedido x praça) com a rota de cada item: usado pela tela da cozinha
// e pelo papel impresso, para os dois mostrarem a mesma coisa.

export type ItemTicket = {
  id: string;
  quantidade: number;
  nome: string;
  adicionais: AdicionalEscolhido[];
  observacao: string | null;
  cancelado: boolean;
  paraViagem: boolean;
  // Praças anteriores da rota que ainda não terminaram (o item espera por elas).
  aguardando: string[];
  // Para onde o item segue depois desta praça.
  depois: string[];
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

const CAMPOS_TICKET = `id, status, criado_em, pronto_em, estacao_id,
  praca:estacoes!tarefas_producao_restaurante_id_estacao_id_fkey(id, nome),
  pedido:pedidos!tarefas_producao_restaurante_id_pedido_id_fkey(
    numero, origem, status, cliente_nome, observacao, aceito_em,
    comanda:comandas!pedidos_restaurante_id_comanda_id_fkey(mesa:mesas!comandas_restaurante_id_mesa_id_fkey(numero)),
    autor:membros!pedidos_restaurante_id_criado_por_fkey(nome),
    itens_pedido(id, quantidade, nome_produto, adicionais, observacao, cancelado_em, etapas, para_viagem, criado_em),
    tarefas:tarefas_producao!tarefas_producao_restaurante_id_pedido_id_fkey(
      estacao_id, status, estacao:estacoes!tarefas_producao_restaurante_id_estacao_id_fkey(nome)
    )
  )`;

type Etapa = { estacao_id: string; ordem: number };

function lerEtapas(valor: unknown): Etapa[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((e): Etapa[] =>
    e && typeof e === "object" && typeof e.estacao_id === "string" ? [{ estacao_id: e.estacao_id, ordem: Number(e.ordem) || 1 }] : [],
  );
}

export function consultarTarefas(client: SupabaseClient<Database>) {
  return client.from("tarefas_producao").select(CAMPOS_TICKET);
}

type LinhaTarefa = NonNullable<Awaited<ReturnType<typeof consultarTarefas>>["data"]>[number];

// Ignora pedido cancelado e delivery ainda não aceito pelo caixa.
export function montarTickets(linhas: LinhaTarefa[]): Ticket[] {
  return linhas.flatMap((t): Ticket[] => {
    const p = t.pedido;
    if (!p || !t.praca || p.status === "cancelado") return [];
    // Delivery só entra na cozinha depois que o caixa aceita.
    if (p.origem === "delivery" && p.status === "recebido") return [];
    const situacao = new Map(p.tarefas.map((x) => [x.estacao_id, { pendente: x.status === "pendente", nome: x.estacao?.nome ?? "" }]));
    const itens = p.itens_pedido
      .map((i) => ({ i, etapas: lerEtapas(i.etapas) }))
      .filter(({ etapas }) => etapas.some((e) => e.estacao_id === t.estacao_id))
      .sort((a, b) => a.i.criado_em.localeCompare(b.i.criado_em))
      .map(({ i, etapas }) => {
        const aqui = etapas.find((e) => e.estacao_id === t.estacao_id)!.ordem;
        const nome = (e: Etapa) => situacao.get(e.estacao_id)?.nome ?? "";
        return {
          id: i.id,
          quantidade: i.quantidade,
          nome: i.nome_produto,
          adicionais: lerAdicionais(i.adicionais),
          observacao: i.observacao,
          cancelado: i.cancelado_em !== null,
          paraViagem: i.para_viagem,
          aguardando: etapas.filter((e) => e.ordem < aqui && situacao.get(e.estacao_id)?.pendente).map(nome),
          depois: etapas.filter((e) => e.ordem > aqui).map(nome),
        };
      });
    return [
      {
        id: t.id,
        status: t.status as Ticket["status"],
        // Delivery conta a partir do aceite do caixa (antes do aceite ele nem aparece na cozinha).
        criadoEm: p.origem === "delivery" && p.aceito_em ? p.aceito_em : t.criado_em,
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
}
