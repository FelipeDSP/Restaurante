import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SessaoCaixa = {
  id: string;
  abertaEm: string;
  fechadaEm: string | null;
  valorInicial: number;
  valorContado: number | null;
  abertaPor: string | null;
};

type Valor = { valor: number; quantidade: number };

export type ResumoCaixa = {
  sessao: {
    id: string;
    aberta_em: string;
    fechada_em: string | null;
    valor_inicial: number;
    valor_contado: number | null;
    observacao: string | null;
    aberta_por: string | null;
    fechada_por: string | null;
  };
  total_recebido: number;
  dinheiro_recebido: number;
  sangrias: number;
  suprimentos: number;
  movimentos: { tipo: "sangria" | "suprimento"; valor: number; motivo: string; em: string; por: string | null }[];
  total_vendido: number;
  // Mesas: taxa de serviço e couvert (fora do "vendido").
  servico: number;
  couvert: number;
  // Cupons do delivery (o vendido já vem sem eles).
  descontos: number;
  // Acerto da noite: entregas e valor de cada entregador (vem de entregas_da_sessao).
  entregadores: { nome: string; entregas: number; valor: number }[];
  quantidade_itens: number;
  por_forma: (Valor & { forma: string })[];
  por_origem: (Valor & { origem: string })[];
  por_membro: (Valor & { nome: string })[];
  comandas: { fechadas: number; canceladas: number; abertas: number };
  pedidos_por_origem: { origem: string; quantidade: number }[];
  itens_mais_vendidos: { nome: string; quantidade: number; total: number }[];
  itens_cancelados: { nome: string; quantidade: number; total: number; motivo: string | null; em: string; por: string | null }[];
  pedidos_cancelados: { numero: number; origem: string; total: number; motivo: string | null; em: string; por: string | null }[];
  estornos: { forma: string; valor: number; em: string; por: string | null; registrado_por: string | null; motivo: string | null }[];
};

export async function carregarSessaoAberta(restauranteId: string): Promise<SessaoCaixa | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caixa_sessoes")
    .select("id, aberta_em, fechada_em, valor_inicial, valor_contado, aberta:membros!caixa_sessoes_restaurante_id_aberta_por_fkey(nome)")
    .eq("restaurante_id", restauranteId)
    .is("fechada_em", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    abertaEm: data.aberta_em,
    fechadaEm: data.fechada_em,
    valorInicial: data.valor_inicial,
    valorContado: data.valor_contado,
    abertaPor: data.aberta?.nome ?? null,
  };
}

export async function listarSessoesFechadas(restauranteId: string, limite = 20): Promise<SessaoCaixa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caixa_sessoes")
    .select("id, aberta_em, fechada_em, valor_inicial, valor_contado, aberta:membros!caixa_sessoes_restaurante_id_aberta_por_fkey(nome)")
    .eq("restaurante_id", restauranteId)
    .not("fechada_em", "is", null)
    .order("aberta_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data.map((s) => ({
    id: s.id,
    abertaEm: s.aberta_em,
    fechadaEm: s.fechada_em,
    valorInicial: s.valor_inicial,
    valorContado: s.valor_contado,
    abertaPor: s.aberta?.nome ?? null,
  }));
}

// Resumo calculado no banco (RPC resumo_caixa_sessao). Null se a sessão não for do restaurante.
export async function carregarResumo(restauranteId: string, sessaoId: string): Promise<ResumoCaixa | null> {
  const supabase = await createClient();
  // Garante que a sessão é do restaurante ativo (a RPC já respeita a RLS, mas o usuário pode
  // pertencer a mais de um restaurante).
  const { data: sessao } = await supabase
    .from("caixa_sessoes")
    .select("id")
    .eq("id", sessaoId)
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!sessao) return null;

  const [{ data, error }, entregas] = await Promise.all([
    supabase.rpc("resumo_caixa_sessao", { p_sessao_id: sessaoId }),
    supabase.rpc("entregas_da_sessao", { p_sessao_id: sessaoId }),
  ]);
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { ...(data as Omit<ResumoCaixa, "entregadores">), entregadores: (entregas.data as ResumoCaixa["entregadores"] | null) ?? [] };
}

// Dinheiro que deveria estar na gaveta: troco inicial + recebido em dinheiro + suprimentos − sangrias.
export function dinheiroEsperado(resumo: ResumoCaixa): number {
  return resumo.sessao.valor_inicial + resumo.dinheiro_recebido + (resumo.suprimentos ?? 0) - (resumo.sangrias ?? 0);
}

export type PendenciasFechamento = {
  comandas: { mesaId: string; mesa: string; falta: number }[];
  deliveries: { numero: number; status: string; falta: number }[];
  // Quanto ainda não foi pago e passa para o próximo caixa (o dono precisa do número,
  // não de 81 links um por um).
  faltaReceber: number;
};

// O que impede fechar o caixa (o banco também recusa): mostrado antes do clique, com link.
export async function carregarPendencias(restauranteId: string, sessaoId: string): Promise<PendenciasFechamento> {
  const supabase = await createClient();
  const [comandas, deliveries] = await Promise.all([
    supabase
      .from("comandas")
      .select("mesa_id, total, mesas(numero), pagamentos(valor, estornado_em)")
      .eq("restaurante_id", restauranteId)
      .in("status", ["aberta", "conta_pedida"]),
    supabase
      .from("pedidos")
      .select("numero, status, total, pagamentos(valor, estornado_em)")
      .eq("restaurante_id", restauranteId)
      .eq("caixa_sessao_id", sessaoId)
      .eq("origem", "delivery")
      .not("status", "in", "(entregue,cancelado)")
      .order("numero"),
  ]);
  // O que falta receber em cada um: o total menos os pagamentos que não foram estornados.
  const falta = (total: number, pagamentos: { valor: number; estornado_em: string | null }[]) =>
    Math.max(0, total - pagamentos.filter((p) => !p.estornado_em).reduce((soma, p) => soma + p.valor, 0));
  const listaComandas = (comandas.data ?? []).map((c) => ({
    mesaId: c.mesa_id,
    mesa: c.mesas?.numero ?? "?",
    falta: falta(c.total, c.pagamentos),
  }));
  const listaDeliveries = (deliveries.data ?? []).map((p) => ({
    numero: p.numero,
    status: p.status,
    falta: falta(p.total, p.pagamentos),
  }));
  return {
    comandas: listaComandas,
    deliveries: listaDeliveries,
    faltaReceber: [...listaComandas, ...listaDeliveries].reduce((soma, x) => soma + x.falta, 0),
  };
}

// Telas de dinheiro (Início e Caixa) refazem `resumo_caixa_sessao` a cada render, que varre a
// sessão inteira (45 ms com 1.689 itens). Num pico de 5 ações por segundo isso era 5 varreduras
// por segundo em cada tela aberta. Um total que demora alguns segundos para mudar não atrapalha
// ninguém, então os eventos são juntados numa janela bem maior que os 300 ms das telas de operação.
export const ESPERA_TELA_DE_DINHEIRO = 3000;
