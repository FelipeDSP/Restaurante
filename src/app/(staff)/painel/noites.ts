import "server-only";

import { diaLocal } from "@/lib/tempo";
import { carregarResumo, listarSessoesFechadas } from "@/modulos/caixa/dados";

// As últimas noites de caixa já resumidas, do jeito que o Início desenha: o gráfico de linha, os
// totais da semana e os mais vendidos do período.
//
// A noite é a sessão de caixa, não o dia do calendário (o restaurante pode fechar depois da
// meia-noite) — a mesma definição do resumo e dos relatórios.
export type Noite = {
  id: string;
  dia: string;
  vendido: number;
  contas: number;
  ticket: number;
};

export type Noites = {
  lista: Noite[];
  vendido: number;
  contas: number;
  media: number;
  ticketMedio: number;
  // Nome e quantidade dos mais vendidos somando todas essas noites.
  maisVendidos: { nome: string; quantidade: number; total: number }[];
};

export const NOITES_VAZIO: Noites = { lista: [], vendido: 0, contas: 0, media: 0, ticketMedio: 0, maisVendidos: [] };

export const NOITES = 7;

export async function carregarNoites(restauranteId: string, fuso: string, limite = NOITES): Promise<Noites> {
  const sessoes = await listarSessoesFechadas(restauranteId, limite);
  if (sessoes.length === 0) return NOITES_VAZIO;
  const resumos = await Promise.all(sessoes.map((s) => carregarResumo(restauranteId, s.id)));

  const lista = sessoes.flatMap<Noite>((s, n) => {
    const r = resumos[n];
    if (!r) return [];
    // Contas = comandas fechadas + pedidos de delivery/balcão (pedidos de mesa são vários por comanda).
    const contas = r.comandas.fechadas + r.pedidos_por_origem.filter((p) => p.origem !== "mesa").reduce((soma, p) => soma + p.quantidade, 0);
    return [{ id: s.id, dia: diaLocal(s.abertaEm, fuso), vendido: r.total_vendido, contas, ticket: contas ? Math.round(r.total_vendido / contas) : 0 }];
  });
  // Da mais antiga para a mais nova: é a ordem em que o gráfico de linha é lido.
  lista.reverse();

  const vendidos = new Map<string, { quantidade: number; total: number }>();
  for (const r of resumos) {
    for (const i of r?.itens_mais_vendidos ?? []) {
      const atual = vendidos.get(i.nome) ?? { quantidade: 0, total: 0 };
      vendidos.set(i.nome, { quantidade: atual.quantidade + i.quantidade, total: atual.total + i.total });
    }
  }

  const vendido = lista.reduce((soma, n) => soma + n.vendido, 0);
  const contas = lista.reduce((soma, n) => soma + n.contas, 0);
  return {
    lista,
    vendido,
    contas,
    media: lista.length ? Math.round(vendido / lista.length) : 0,
    ticketMedio: contas ? Math.round(vendido / contas) : 0,
    maisVendidos: [...vendidos]
      .sort((a, b) => b[1].quantidade - a[1].quantidade)
      .slice(0, 5)
      .map(([nome, v]) => ({ nome, ...v })),
  };
}
