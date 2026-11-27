import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { type AdicionalEscolhido, lerAdicionais } from "@/lib/adicionais";
import { type Etapa, lerEtapas } from "@/lib/preparo";
import type { Database } from "@/types/database";

// Ticket de setor (pedido x setor) com a rota de cada item: usado pela tela da cozinha
// e pelo papel impresso, para os dois mostrarem a mesma coisa.

export type ItemTicket = {
  id: string;
  quantidade: number;
  nome: string;
  adicionais: AdicionalEscolhido[];
  observacao: string | null;
  cancelado: boolean;
  paraViagem: boolean;
  // Setores anteriores da rota que ainda não terminaram (o item espera por eles).
  aguardando: string[];
  // Para onde o item segue depois deste setor.
  depois: string[];
};

// Um ticket = os itens de um pedido para uma etapa de um setor (o que espera outro setor sai num
// ticket separado do que pode ser feito na hora).
export type Ticket = {
  id: string;
  status: "pendente" | "pronto";
  criadoEm: string;
  prontoEm: string | null;
  praca: { id: string; nome: string };
  pedido: {
    numero: number;
    origem: "mesa" | "delivery" | "balcao";
    // No delivery: "retirada" quer dizer que o cliente vem buscar (ninguém sai com o prato).
    tipoEntrega: "entrega" | "retirada";
    mesa: string | null;
    // Garçom responsável pela comanda (membro), para "minhas mesas primeiro".
    garcomId: string | null;
    autor: string | null;
    cliente: string | null;
    observacao: string | null;
  };
  itens: ItemTicket[];
};

const CAMPOS_TICKET = `id, status, criado_em, pronto_em, estacao_id, ordem,
  praca:estacoes!tarefas_producao_restaurante_id_estacao_id_fkey(id, nome),
  pedido:pedidos!tarefas_producao_restaurante_id_pedido_id_fkey(
    numero, origem, tipo_entrega, status, cliente_nome, observacao, aceito_em,
    comanda:comandas!pedidos_restaurante_id_comanda_id_fkey(garcom_id, mesa:mesas!comandas_restaurante_id_mesa_id_fkey(numero)),
    autor:membros!pedidos_restaurante_id_criado_por_fkey(nome),
    itens_pedido(id, quantidade, nome_produto, adicionais, observacao, cancelado_em, etapas, para_viagem, criado_em),
    tarefas:tarefas_producao!tarefas_producao_restaurante_id_pedido_id_fkey(
      estacao_id, ordem, status, estacao:estacoes!tarefas_producao_restaurante_id_estacao_id_fkey(nome)
    )
  )`;


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
    const chave = (estacao: string, ordem: number) => `${estacao}:${ordem}`;
    const situacao = new Map(p.tarefas.map((x) => [chave(x.estacao_id, x.ordem), { pendente: x.status === "pendente", nome: x.estacao?.nome ?? "" }]));
    const nomePraca = new Map(p.tarefas.map((x) => [x.estacao_id, x.estacao?.nome ?? ""]));
    const itens = p.itens_pedido
      .map((i) => ({ i, etapas: lerEtapas(i.etapas) }))
      .filter(({ etapas }) => etapas.some((e) => e.estacao_id === t.estacao_id && e.ordem === t.ordem))
      .sort((a, b) => a.i.criado_em.localeCompare(b.i.criado_em))
      .map(({ i, etapas }) => {
        const aqui = t.ordem;
        const nome = (e: Etapa) => nomePraca.get(e.estacao_id) ?? "";
        return {
          id: i.id,
          quantidade: i.quantidade,
          nome: i.nome_produto,
          adicionais: lerAdicionais(i.adicionais),
          observacao: i.observacao,
          cancelado: i.cancelado_em !== null,
          paraViagem: i.para_viagem,
          aguardando: etapas.filter((e) => e.ordem < aqui && situacao.get(chave(e.estacao_id, e.ordem))?.pendente).map(nome),
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
          tipoEntrega: p.tipo_entrega === "retirada" ? ("retirada" as const) : ("entrega" as const),
          mesa: p.comanda?.mesa?.numero ?? null,
          garcomId: p.comanda?.garcom_id ?? null,
          autor: p.autor?.nome ?? null,
          cliente: p.cliente_nome,
          observacao: p.observacao,
        },
        itens,
      },
    ];
  });
}
