import "server-only";

import { consultarDisponibilidade, type Disponibilidade } from "@/app/(publico)/[slug]/dados";
import type { Permissao } from "@/lib/auth/papeis";
import { contarImpressoesComErro } from "@/lib/impressao/avisos";
import { createClient } from "@/lib/supabase/server";

// O que está esperando alguém, no Início. Tudo aqui tem dono: ou uma pessoa age, ou um cliente
// fica esperando. Número que não pede nada (vendido, ticket médio) fica no bloco de baixo.
//
// Cada contagem usa `head: true` — só o total, sem trazer linha — e só roda para quem tem a
// permissão de resolver aquilo: quem não pode agir não precisa carregar a cobrança na tela.
export type Pendencias = {
  deliveryNovos: number;
  mensagens: number;
  contaPedida: number;
  estoque: number;
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

// Itens que acabaram, ficaram negativos ou passaram do mínimo. Traz só saldo e mínimo: a lista
// pode ter centenas de itens e aqui só o número importa.
async function estoqueAcabando(restauranteId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("estoque_itens")
    .select("saldo, minimo")
    .eq("restaurante_id", restauranteId)
    .eq("ativo", true);
  return (data ?? []).filter((i) => {
    const saldo = Number(i.saldo);
    const minimo = Number(i.minimo);
    return saldo <= 0 || (minimo > 0 && saldo <= minimo);
  }).length;
}

export async function carregarPendencias(restauranteId: string, permissoes: readonly Permissao[]): Promise<Pendencias> {
  const pode = (p: Permissao) => permissoes.includes(p);
  const delivery = pode("delivery");
  const mesas = pode("comandas_painel") || pode("garcom_app");

  const [deliveryNovos, mensagens, contaPedida, estoque, impressao, site] = await Promise.all([
    delivery ? deliveryEsperandoAceite(restauranteId) : 0,
    delivery ? mensagensSemResposta(restauranteId) : 0,
    mesas ? mesasPedindoAConta(restauranteId) : 0,
    pode("estoque") ? estoqueAcabando(restauranteId) : 0,
    contarImpressoesComErro(restauranteId),
    consultarDisponibilidade(restauranteId),
  ]);

  return { deliveryNovos, mensagens, contaPedida, estoque, impressao, site };
}
