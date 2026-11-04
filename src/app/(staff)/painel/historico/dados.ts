import "server-only";

import { lerAdicionais, resumoAdicionais } from "@/lib/adicionais";
import { createClient } from "@/lib/supabase/server";

// Histórico: comandas encerradas e deliveries terminados, só leitura. O banco não deixa mudar uma
// conta encerrada (migração `historico_imutavel`), então o que aparece aqui é o que aconteceu.

export const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
] as const;
type PeriodoId = (typeof PERIODOS)[number]["id"];

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function hojeLocal(fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Diferença (minutos) entre o relógio do fuso e o UTC naquele instante.
function deslocamento(fuso: string, instante: number): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instante))
      .map((p) => [p.type, p.value]),
  );
  const comoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  return Math.round((comoUtc - instante) / 60_000);
}

// Meia-noite do dia no fuso do restaurante, em ISO (UTC).
function inicioDoDia(data: string, fuso: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const utc = Date.UTC(a, m - 1, d);
  return new Date(utc - deslocamento(fuso, utc) * 60_000).toISOString();
}

export type Periodo = { de: string; ate: string; periodo: PeriodoId | null };

export function resolverPeriodo(fuso: string, params: { periodo?: string; de?: string; ate?: string }): Periodo {
  const hoje = hojeLocal(fuso);
  if (!params.periodo && params.de && params.ate && DATA.test(params.de) && DATA.test(params.ate)) {
    const [de, ate] = params.de <= params.ate ? [params.de, params.ate] : [params.ate, params.de];
    return { de: de < somarDias(ate, -92) ? somarDias(ate, -92) : de, ate, periodo: null };
  }
  switch (params.periodo) {
    case "ontem":
      return { de: somarDias(hoje, -1), ate: somarDias(hoje, -1), periodo: "ontem" };
    case "7d":
      return { de: somarDias(hoje, -6), ate: hoje, periodo: "7d" };
    case "30d":
      return { de: somarDias(hoje, -29), ate: hoje, periodo: "30d" };
    default:
      return { de: hoje, ate: hoje, periodo: "hoje" };
  }
}

export type LinhaHistorico = {
  tipo: "comanda" | "delivery";
  id: string;
  titulo: string; // "Mesa 5" ou "Delivery nº 12"
  quem: string | null; // garçom ou cliente
  situacao: "fechada" | "cancelada" | "entregue" | "cancelado";
  quando: string; // ISO do encerramento
  total: number;
};

const LIMITE = 300;

export async function carregarHistorico(
  restauranteId: string,
  fuso: string,
  periodo: Periodo,
  filtros: { tipo: "todos" | "mesas" | "delivery"; busca: string },
): Promise<{ linhas: LinhaHistorico[]; cortado: boolean }> {
  const supabase = await createClient();
  const de = inicioDoDia(periodo.de, fuso);
  const ate = inicioDoDia(somarDias(periodo.ate, 1), fuso);

  const [comandas, deliveries, equipe] = await Promise.all([
    filtros.tipo === "delivery"
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("comandas")
          .select("id, status, fechada_em, total, garcom_id, mesa:mesas!comandas_restaurante_id_mesa_id_fkey(numero)")
          .eq("restaurante_id", restauranteId)
          .in("status", ["fechada", "cancelada"])
          .gte("fechada_em", de)
          .lt("fechada_em", ate)
          .order("fechada_em", { ascending: false })
          .limit(LIMITE),
    filtros.tipo === "mesas"
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("pedidos")
          .select("id, numero, status, finalizado_em, total, cliente_nome")
          .eq("restaurante_id", restauranteId)
          .eq("origem", "delivery")
          .in("status", ["entregue", "cancelado"])
          .gte("finalizado_em", de)
          .lt("finalizado_em", ate)
          .order("finalizado_em", { ascending: false })
          .limit(LIMITE),
    nomesDaEquipe(restauranteId),
  ]);
  if (comandas.error) throw new Error(comandas.error.message);
  if (deliveries.error) throw new Error(deliveries.error.message);

  const linhas: LinhaHistorico[] = [
    ...comandas.data.map((c) => ({
      tipo: "comanda" as const,
      id: c.id,
      titulo: `Mesa ${c.mesa?.numero ?? "?"}`,
      quem: c.garcom_id ? (equipe.get(c.garcom_id) ?? null) : null,
      situacao: c.status as LinhaHistorico["situacao"],
      quando: c.fechada_em ?? "",
      total: c.total,
    })),
    ...deliveries.data.map((p) => ({
      tipo: "delivery" as const,
      id: p.id,
      titulo: `Delivery nº ${p.numero}`,
      quem: p.cliente_nome,
      situacao: p.status as LinhaHistorico["situacao"],
      quando: p.finalizado_em ?? "",
      total: p.total,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando));

  const busca = filtros.busca.trim().toLowerCase();
  const filtradas = busca
    ? linhas.filter((l) => `${l.titulo} ${l.quem ?? ""} ${l.titulo.replace(/\D/g, "")}`.toLowerCase().includes(busca))
    : linhas;
  return { linhas: filtradas.slice(0, LIMITE), cortado: comandas.data.length >= LIMITE || deliveries.data.length >= LIMITE };
}

export async function nomesDaEquipe(restauranteId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("membros").select("id, nome").eq("restaurante_id", restauranteId);
  return new Map((data ?? []).map((m) => [m.id, m.nome]));
}

export type ItemHistorico = {
  id: string;
  nome: string;
  opcoes: string | null;
  quantidade: number;
  total: number;
  observacao: string | null;
  cancelado: { em: string; por: string | null; motivo: string | null } | null;
};

export type PagamentoHistorico = {
  id: string;
  forma: string;
  valor: number;
  em: string;
  por: string | null;
  estorno: { em: string; por: string | null; motivo: string | null } | null;
};

const nomeDe = (equipe: Map<string, string>, id: string | null) => (id ? (equipe.get(id) ?? "Equipe") : null);

function itensDe(
  itens: {
    id: string;
    nome_produto: string;
    quantidade: number;
    total: number;
    observacao: string | null;
    adicionais: unknown;
    cancelado_em: string | null;
    cancelado_por: string | null;
    motivo_cancelamento: string | null;
  }[],
  equipe: Map<string, string>,
): ItemHistorico[] {
  return itens.map((i) => ({
    id: i.id,
    nome: i.nome_produto,
    opcoes: resumoAdicionais(lerAdicionais(i.adicionais)) || null,
    quantidade: i.quantidade,
    total: i.total,
    observacao: i.observacao,
    cancelado: i.cancelado_em ? { em: i.cancelado_em, por: nomeDe(equipe, i.cancelado_por), motivo: i.motivo_cancelamento } : null,
  }));
}

function pagamentosDe(
  pagamentos: {
    id: string;
    forma: string;
    valor: number;
    criado_em: string;
    registrado_por: string | null;
    estornado_em: string | null;
    estornado_por: string | null;
    motivo_estorno: string | null;
  }[],
  equipe: Map<string, string>,
): PagamentoHistorico[] {
  return [...pagamentos]
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .map((p) => ({
      id: p.id,
      forma: p.forma,
      valor: p.valor,
      em: p.criado_em,
      por: nomeDe(equipe, p.registrado_por),
      estorno: p.estornado_em ? { em: p.estornado_em, por: nomeDe(equipe, p.estornado_por), motivo: p.motivo_estorno } : null,
    }));
}

const CAMPOS_ITEM = "id, nome_produto, quantidade, total, observacao, adicionais, cancelado_em, cancelado_por, motivo_cancelamento";
const CAMPOS_PAGAMENTO = "id, forma, valor, criado_em, registrado_por, estornado_em, estornado_por, motivo_estorno";

export async function carregarComanda(restauranteId: string, comandaId: string) {
  const supabase = await createClient();
  const [{ data: c, error }, equipe] = await Promise.all([
    supabase
      .from("comandas")
      .select(
        `id, status, pessoas, aberta_em, fechada_em, fechada_por, garcom_id, subtotal, servico, couvert, total, servico_percentual,
         mesa:mesas!comandas_restaurante_id_mesa_id_fkey(numero),
         pedidos!pedidos_restaurante_id_comanda_id_fkey(id, numero, criado_em, criado_por, status, cancelado_em, motivo_cancelamento, itens_pedido!itens_pedido_restaurante_id_pedido_id_fkey(${CAMPOS_ITEM})),
         pagamentos!pagamentos_restaurante_id_comanda_id_fkey(${CAMPOS_PAGAMENTO})`,
      )
      .eq("restaurante_id", restauranteId)
      .eq("id", comandaId)
      .maybeSingle(),
    nomesDaEquipe(restauranteId),
  ]);
  if (error) throw new Error(error.message);
  if (!c) return null;
  return {
    id: c.id,
    status: c.status as "aberta" | "conta_pedida" | "fechada" | "cancelada",
    mesa: c.mesa?.numero ?? "?",
    pessoas: c.pessoas,
    abertaEm: c.aberta_em,
    fechadaEm: c.fechada_em,
    fechadaPor: nomeDe(equipe, c.fechada_por),
    garcom: nomeDe(equipe, c.garcom_id),
    subtotal: c.subtotal,
    servico: c.servico,
    couvert: c.couvert,
    total: c.total,
    lancamentos: [...c.pedidos]
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
      .map((p) => ({
        id: p.id,
        numero: p.numero,
        em: p.criado_em,
        por: p.criado_por ? nomeDe(equipe, p.criado_por) : "Cliente pelo celular",
        cancelado: p.cancelado_em ? { em: p.cancelado_em, motivo: p.motivo_cancelamento } : null,
        itens: itensDe(p.itens_pedido, equipe),
      })),
    pagamentos: pagamentosDe(c.pagamentos, equipe),
  };
}

export async function carregarDelivery(restauranteId: string, pedidoId: string) {
  const supabase = await createClient();
  const [{ data: p, error }, equipe] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        `id, numero, status, criado_em, aceito_em, finalizado_em, cancelado_em, cancelado_por, motivo_cancelamento,
         cliente_nome, cliente_telefone, endereco, forma_pagamento_prevista, troco_para, observacao,
         subtotal, taxa_entrega, desconto, cupom_codigo, total, valor_entregador,
         bairro:bairros_entrega!pedidos_restaurante_id_bairro_id_fkey(nome),
         entregador:entregadores!pedidos_restaurante_id_entregador_id_fkey(nome),
         itens_pedido!itens_pedido_restaurante_id_pedido_id_fkey(${CAMPOS_ITEM}),
         pagamentos!pagamentos_restaurante_id_pedido_id_fkey(${CAMPOS_PAGAMENTO}),
         pedidos_alteracoes(descricao, criado_em, membro_id)`,
      )
      .eq("restaurante_id", restauranteId)
      .eq("origem", "delivery")
      .eq("id", pedidoId)
      .maybeSingle(),
    nomesDaEquipe(restauranteId),
  ]);
  if (error) throw new Error(error.message);
  if (!p) return null;
  const e = p.endereco && typeof p.endereco === "object" && !Array.isArray(p.endereco) ? (p.endereco as Record<string, string | null>) : {};
  return {
    id: p.id,
    numero: p.numero,
    status: p.status as "recebido" | "em_preparo" | "pronto" | "saiu_entrega" | "entregue" | "cancelado",
    criadoEm: p.criado_em,
    aceitoEm: p.aceito_em,
    finalizadoEm: p.finalizado_em,
    cancelamento: p.cancelado_em ? { em: p.cancelado_em, por: nomeDe(equipe, p.cancelado_por), motivo: p.motivo_cancelamento } : null,
    cliente: p.cliente_nome,
    telefone: p.cliente_telefone,
    endereco: [[e.rua, e.numero].filter(Boolean).join(", "), e.complemento, p.bairro?.nome ?? e.bairro, e.referencia ? `Ref.: ${e.referencia}` : null]
      .filter(Boolean)
      .join(" · "),
    formaPrevista: p.forma_pagamento_prevista,
    trocoPara: p.troco_para,
    observacao: p.observacao,
    subtotal: p.subtotal,
    taxaEntrega: p.taxa_entrega,
    desconto: p.desconto,
    cupom: p.cupom_codigo,
    total: p.total,
    entregador: p.entregador?.nome ?? null,
    itens: itensDe(p.itens_pedido, equipe),
    pagamentos: pagamentosDe(p.pagamentos, equipe),
    alteracoes: [...p.pedidos_alteracoes]
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
      .map((a) => ({ descricao: a.descricao, em: a.criado_em, por: nomeDe(equipe, a.membro_id) })),
  };
}
