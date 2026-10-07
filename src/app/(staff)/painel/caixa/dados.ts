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
  total_vendido: number;
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

  const { data, error } = await supabase.rpc("resumo_caixa_sessao", { p_sessao_id: sessaoId });
  if (error) throw new Error(error.message);
  return (data as ResumoCaixa | null) ?? null;
}

// Dinheiro que deveria estar na gaveta: troco inicial + recebido em dinheiro.
export function dinheiroEsperado(resumo: ResumoCaixa): number {
  return resumo.sessao.valor_inicial + resumo.dinheiro_recebido;
}

export type PendenciasFechamento = {
  comandas: { mesaId: string; mesa: string }[];
  deliveries: { numero: number; status: string }[];
};

// O que impede fechar o caixa (o banco também recusa): mostrado antes do clique, com link.
export async function carregarPendencias(restauranteId: string, sessaoId: string): Promise<PendenciasFechamento> {
  const supabase = await createClient();
  const [comandas, deliveries] = await Promise.all([
    supabase
      .from("comandas")
      .select("mesa_id, mesas(numero)")
      .eq("restaurante_id", restauranteId)
      .in("status", ["aberta", "conta_pedida"]),
    supabase
      .from("pedidos")
      .select("numero, status")
      .eq("restaurante_id", restauranteId)
      .eq("caixa_sessao_id", sessaoId)
      .eq("origem", "delivery")
      .not("status", "in", "(entregue,cancelado)")
      .order("numero"),
  ]);
  return {
    comandas: (comandas.data ?? []).map((c) => ({ mesaId: c.mesa_id, mesa: c.mesas?.numero ?? "?" })),
    deliveries: (deliveries.data ?? []).map((p) => ({ numero: p.numero, status: p.status })),
  };
}
