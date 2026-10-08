import "server-only";

import { createClient } from "@/lib/supabase/server";

// Relatório de um período (várias noites de caixa): `relatorio_vendas` no banco.
export type Relatorio = {
  de: string;
  ate: string;
  fuso: string;
  sessoes: number;
  vendido: number;
  recebido: number;
  contas: number;
  itens: number;
  taxas_entrega: number;
  pedidos_cancelados: { quantidade: number; valor: number };
  itens_cancelados: { quantidade: number; valor: number };
  estornos: { quantidade: number; valor: number };
  por_sessao: { id: string; aberta_em: string; vendido: number; contas: number }[];
  por_dia_semana: { dia: number; noites: number; vendido: number }[];
  por_hora: { hora: number; pedidos: number; vendido: number }[];
  por_origem: { origem: string; pedidos: number; vendido: number }[];
  por_forma: { forma: string; quantidade: number; valor: number }[];
  produtos: { produto_id: string; nome: string; categoria: string | null; quantidade: number; total: number }[];
  bairros: { nome: string; pedidos: number; vendido: number; taxas: number }[];
  garcons: { nome: string; comandas: number; vendido: number; pessoas: number | null }[];
};

export async function carregarRelatorio(restauranteId: string, de: string, ate: string): Promise<Relatorio> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("relatorio_vendas", { p_restaurante_id: restauranteId, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return data as unknown as Relatorio;
}

// ---- Período ----------------------------------------------------------------

export const PERIODOS = [
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "30d", rotulo: "Últimos 30 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mes-passado", rotulo: "Mês passado" },
] as const;

export type PeriodoId = (typeof PERIODOS)[number]["id"];

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// "Hoje" no fuso do restaurante, como AAAA-MM-DD.
function hojeLocal(fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function valida(data: string | undefined): data is string {
  return !!data && DATA.test(data) && !Number.isNaN(new Date(`${data}T12:00:00Z`).getTime());
}

// Período pedido na URL (?periodo=7d, ou ?de=...&ate=...); padrão: últimos 30 dias.
export function resolverPeriodo(
  fuso: string,
  params: { periodo?: string; de?: string; ate?: string },
): { de: string; ate: string; periodo: PeriodoId | null } {
  const hoje = hojeLocal(fuso);
  if (!params.periodo && valida(params.de) && valida(params.ate)) {
    const [de, ate] = params.de <= params.ate ? [params.de, params.ate] : [params.ate, params.de];
    // O banco aceita até 400 dias; mais que isso, corta no começo.
    return { de: de < somarDias(ate, -400) ? somarDias(ate, -400) : de, ate, periodo: null };
  }
  switch (params.periodo) {
    case "7d":
      return { de: somarDias(hoje, -6), ate: hoje, periodo: "7d" };
    case "mes":
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje, periodo: "mes" };
    case "mes-passado": {
      const fimMesPassado = somarDias(`${hoje.slice(0, 7)}-01`, -1);
      return { de: `${fimMesPassado.slice(0, 7)}-01`, ate: fimMesPassado, periodo: "mes-passado" };
    }
    default:
      return { de: somarDias(hoje, -29), ate: hoje, periodo: "30d" };
  }
}

// "01/10" ou "01/10/2025" (ano só quando não é o atual).
export function dataCurta(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return ano === String(new Date().getFullYear()) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}
