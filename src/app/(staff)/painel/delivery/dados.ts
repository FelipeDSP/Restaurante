import "server-only";

import { lerAdicionais } from "@/lib/adicionais";
import { createClient } from "@/lib/supabase/server";
import { horaLocal, tempoDesde } from "@/lib/tempo";

import type { PedidoDelivery } from "./cartao-pedido";

// Só a aba Conversas pede o texto; o quadro pede (autor, lida_em) e conta.
type MensagemCompleta = { id: string; autor: string; texto: string; criado_em: string; lida_em: string | null };

const CONVERSA_MS = 24 * 60 * 60 * 1000;
// Limite da conversa com o cliente: até 24 h depois de o pedido terminar.
export function inicioDaConversa() {
  return new Date(Date.now() - CONVERSA_MS).toISOString();
}

// Quais pedidos carregar. O quadro do Delivery é operacional: os em andamento são todos,
// e os finalizados viram só os últimos (o resto está no Histórico). Antes o quadro trazia os
// até 200 finalizados da sessão e renderizava todos.
export type FiltroDelivery =
  | { ids: string[] }
  | { emAndamento: true }
  | { finalizadosDaSessao: string; quantos: number };

// Quantos finalizados o quadro mostra: o bastante para conferir o que acabou de ser finalizado.
export const FINALIZADOS_NO_QUADRO = 12;

// Pedidos de delivery no formato do cartão (quadro do Delivery e Conversas).
// `comMensagens` só para a aba Conversas, que mostra o texto; o quadro usa as contagens.
export async function carregarPedidosDelivery(
  restauranteId: string,
  fuso: string,
  filtro: FiltroDelivery,
  { comMensagens = false }: { comMensagens?: boolean } = {},
): Promise<PedidoDelivery[]> {
  const supabase = await createClient();
  const conversaDesde = inicioDaConversa();
  const recentesPrimeiro = "finalizadosDaSessao" in filtro;
  const consulta = supabase
    .from("pedidos")
    .select(
      `id, numero, status, criado_em, cliente_nome, cliente_telefone, endereco, bairro_id, forma_pagamento_prevista, troco_para,
       observacao, subtotal, taxa_entrega, total, motivo_cancelamento, desconto, cupom_codigo, cupom_tipo, cupom_valor,
       bairro:bairros_entrega!pedidos_restaurante_id_bairro_id_fkey(nome),
       itens_pedido(id, nome_produto, quantidade, observacao, adicionais, total, cancelado_em),
       pagamentos(valor, estornado_em),
       tarefas_producao(status),
       pedidos_alteracoes(descricao, criado_em),
       ${comMensagens ? "pedidos_mensagens(id, autor, texto, criado_em, lida_em)" : "pedidos_mensagens(autor, lida_em)"},
       entregador_id, valor_entregador, finalizado_em`,
    )
    .eq("restaurante_id", restauranteId)
    .eq("origem", "delivery");
  const comFiltro =
    "ids" in filtro
      ? consulta.in("id", filtro.ids)
      : "emAndamento" in filtro
        ? consulta.not("status", "in", "(entregue,cancelado)")
        : consulta.eq("caixa_sessao_id", filtro.finalizadosDaSessao).in("status", ["entregue", "cancelado"]);
  const { data, error } = await comFiltro
    .order("criado_em", { ascending: !recentesPrimeiro })
    .limit("finalizadosDaSessao" in filtro ? filtro.quantos : 200);
  if (error) throw new Error(error.message);

  return data.map((p) => ({
    id: p.id,
    numero: p.numero,
    status: p.status as PedidoDelivery["status"],
    hora: horaLocal(p.criado_em, fuso),
    tempo: tempoDesde(p.criado_em),
    clienteNome: p.cliente_nome ?? "",
    clienteTelefone: p.cliente_telefone ?? "",
    endereco:
      p.endereco && typeof p.endereco === "object" && !Array.isArray(p.endereco)
        ? (p.endereco as Record<string, string | null>)
        : {},
    bairro:
      p.bairro?.nome ??
      (p.endereco && typeof p.endereco === "object" && !Array.isArray(p.endereco)
        ? ((p.endereco as Record<string, string | null>).bairro ?? null)
        : null),
    formaPrevista: p.forma_pagamento_prevista,
    trocoPara: p.troco_para,
    observacao: p.observacao,
    subtotal: p.subtotal,
    taxaEntrega: p.taxa_entrega,
    desconto: p.desconto,
    cupom: p.cupom_codigo ? { codigo: p.cupom_codigo, tipo: p.cupom_tipo ?? "", valor: p.cupom_valor ?? 0 } : null,
    total: p.total,
    pago: p.pagamentos.filter((pg) => !pg.estornado_em).reduce((soma, pg) => soma + pg.valor, 0),
    pracasPendentes: p.tarefas_producao.filter((t) => t.status === "pendente").length,
    motivoCancelamento: p.motivo_cancelamento,
    bairroId: p.bairro_id,
    entregadorId: p.entregador_id,
    valorEntregador: p.valor_entregador,
    conversa: {
      aberta: !p.finalizado_em || new Date(p.finalizado_em) > new Date(conversaDesde),
      total: p.pedidos_mensagens.length,
      naoLidas: p.pedidos_mensagens.filter((m) => m.autor === "cliente" && m.lida_em === null).length,
      mensagens: comMensagens
        ? (p.pedidos_mensagens as MensagemCompleta[])
            .toSorted((a, b) => a.criado_em.localeCompare(b.criado_em))
            .map((m) => ({ id: m.id, autor: m.autor as "cliente" | "equipe", texto: m.texto, hora: horaLocal(m.criado_em, fuso), lida: m.lida_em !== null }))
        : [],
    },
    alteracoes: p.pedidos_alteracoes
      .toSorted((a, b) => a.criado_em.localeCompare(b.criado_em))
      .map((a) => ({ descricao: a.descricao, hora: horaLocal(a.criado_em, fuso) })),
    itens: p.itens_pedido
      .filter((i) => !i.cancelado_em)
      .map((i) => ({
        id: i.id,
        nome: i.nome_produto,
        quantidade: i.quantidade,
        observacao: i.observacao,
        adicionais: lerAdicionais(i.adicionais),
        total: i.total,
      })),
  }));
}

// Entregadores ativos (para escolher no cartão).
export async function carregarEntregadores(restauranteId: string): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entregadores")
    .select("id, nome")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true)
    .order("nome");
  return data ?? [];
}
