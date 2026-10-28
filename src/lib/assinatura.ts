import "server-only";

import { type IdPlano, planoPorId } from "@/lib/planos";
import { createClient } from "@/lib/supabase/server";

export type SituacaoAssinatura = "teste" | "teste_encerrado" | "ativa" | "atrasada" | "cancelada" | "cortesia";

export type Assinatura = {
  plano: IdPlano;
  situacao: SituacaoAssinatura;
  testeTerminaEm: string | null;
  periodoTerminaEm: string | null;
  diasRestantesTeste: number | null;
  // Fatura em aberto no Asaas (botão "Pagar") e se já há cadastro de quem paga (CPF/CNPJ).
  faturaUrl: string | null;
  temCadastroPagamento: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

// Assinatura do restaurante (só o dono lê; para os outros papéis retorna null).
export async function carregarAssinatura(restauranteId: string): Promise<Assinatura | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assinaturas")
    .select("plano, status, teste_termina_em, periodo_termina_em, provedor, provedor_cliente_id, fatura_url")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!data) return null;

  const plano = planoPorId(data.plano)?.id ?? "completo";
  let situacao = data.status as SituacaoAssinatura;
  let diasRestantesTeste: number | null = null;

  if (data.status === "teste" && data.teste_termina_em) {
    const restante = new Date(data.teste_termina_em).getTime() - Date.now();
    diasRestantesTeste = Math.max(0, Math.ceil(restante / DIA_MS));
    if (restante <= 0) situacao = "teste_encerrado";
  }

  return {
    plano,
    situacao,
    testeTerminaEm: data.teste_termina_em,
    periodoTerminaEm: data.periodo_termina_em,
    diasRestantesTeste,
    faturaUrl: data.fatura_url,
    temCadastroPagamento: data.provedor === "asaas" && Boolean(data.provedor_cliente_id),
  };
}

export const NOME_SITUACAO: Record<SituacaoAssinatura, string> = {
  teste: "Teste grátis",
  teste_encerrado: "Teste encerrado",
  ativa: "Ativa",
  atrasada: "Pagamento atrasado",
  cancelada: "Cancelada",
  cortesia: "Cortesia",
};
