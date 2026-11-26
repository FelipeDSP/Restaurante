import "server-only";

import { consultarDisponibilidade, type Disponibilidade } from "@/app/(publico)/[slug]/dados";
import type { Permissao } from "@/lib/auth/papeis";
import { contarImpressoesComErro } from "@/lib/impressao/avisos";
import { createClient } from "@/lib/supabase/server";

import { carregarSessaoAberta, type SessaoCaixa } from "./caixa/dados";

// O que está esperando alguém, no Início. Tudo aqui tem dono: ou uma pessoa age, ou um cliente
// fica esperando. Número que não pede nada (vendido, ticket médio) fica no bloco de baixo.
//
// Cada contagem usa `head: true` — só o total, sem trazer linha — e só roda para quem tem a
// permissão de resolver aquilo: quem não pode agir não precisa carregar a cobrança na tela.
export type ItemBaixo = { id: string; nome: string; unidade: string; saldo: number; minimo: number };

// Depois de quanto tempo um caixa aberto deixa de ser "a noite de hoje" e vira esquecimento.
// Dezoito horas cobrem a virada da madrugada sem cobrar nada de quem abriu de manhã.
const HORAS_DE_CAIXA = 18;

export type Pendencias = {
  sessao: SessaoCaixa | null;
  // Caixa que ninguém fechou: enquanto ele não fecha, o resumo da noite e os relatórios
  // misturam dias diferentes.
  caixaEsquecido: boolean;
  deliveryNovos: number;
  mensagens: number;
  contaPedida: number;
  // Lista, não contagem: o Início também desenha quais itens são, logo abaixo.
  estoque: ItemBaixo[];
  impressao: number;
  site: Disponibilidade;
};

async function deliveryEsperandoAceite(restauranteId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId)
    .eq("origem", "delivery")
    .eq("status", "recebido");
  return count ?? 0;
}

async function mensagensSemResposta(restauranteId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pedidos_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId)
    .eq("autor", "cliente")
    .is("lida_em", null);
  return count ?? 0;
}

// Mesa que pediu a conta: é um cliente de mão levantada esperando alguém chegar.
async function mesasPedindoAConta(restauranteId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("comandas")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId)
    .eq("status", "conta_pedida");
  return count ?? 0;
}

// Itens que acabaram, ficaram negativos ou passaram do mínimo. A conta é feita aqui e não no
// banco porque "abaixo do mínimo" compara duas colunas da mesma linha, o que o filtro do
// PostgREST não faz; a lista de itens de um restaurante é curta.
async function estoqueAcabando(restauranteId: string): Promise<ItemBaixo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("estoque_itens")
    .select("id, nome, unidade, saldo, minimo")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true)
    .order("nome");
  return (data ?? [])
    .map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidade, saldo: Number(i.saldo), minimo: Number(i.minimo) }))
    .filter((i) => i.saldo <= 0 || (i.minimo > 0 && i.saldo <= i.minimo))
    // O que acabou vem antes do que só está baixo.
    .sort((a, b) => a.saldo - b.saldo);
}

export async function carregarPendencias(restauranteId: string, permissoes: readonly Permissao[]): Promise<Pendencias> {
  const pode = (p: Permissao) => permissoes.includes(p);
  const delivery = pode("delivery");
  const mesas = pode("comandas_painel") || pode("garcom_app");

  const [sessao, deliveryNovos, mensagens, contaPedida, estoque, impressao, site] = await Promise.all([
    carregarSessaoAberta(restauranteId),
    delivery ? deliveryEsperandoAceite(restauranteId) : 0,
    delivery ? mensagensSemResposta(restauranteId) : 0,
    mesas ? mesasPedindoAConta(restauranteId) : 0,
    pode("estoque") ? estoqueAcabando(restauranteId) : [],
    contarImpressoesComErro(restauranteId),
    consultarDisponibilidade(restauranteId),
  ]);

  return {
    sessao,
    caixaEsquecido: Boolean(sessao) && Date.now() - new Date(sessao!.abertaEm).getTime() > HORAS_DE_CAIXA * 3600_000,
    deliveryNovos,
    mensagens,
    contaPedida,
    estoque,
    impressao,
    site,
  };
}
