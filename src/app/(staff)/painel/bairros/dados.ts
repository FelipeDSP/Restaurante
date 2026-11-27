import "server-only";

import { chaveBairro } from "@/lib/endereco";
import { createClient } from "@/lib/supabase/server";

export type Bairro = { id: string; nome: string; taxa: number; ativo: boolean };

// Quantos pedidos a sugestão varre. O que interessa é o bairro de onde o pessoal pede hoje, não
// o histórico inteiro.
const PEDIDOS_PARA_SUGERIR = 500;

export async function carregarBairros(restauranteId: string): Promise<Bairro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bairros_entrega")
    .select("id, nome, taxa, ativo")
    .eq("restaurante_id", restauranteId)
    .order("nome");
  if (error) throw new Error(error.message);
  return data;
}

export type BairroSugerido = { nome: string; pedidos: number };

// Cadastrar taxa por bairro era digitar a cidade inteira antes do primeiro pedido. Mas os
// bairros de quem já pediu estão guardados no endereço de cada pedido: a tela sugere os que
// aparecem e o dono só põe o preço.
export async function sugerirBairros(restauranteId: string, jaCadastrados: Bairro[]): Promise<BairroSugerido[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedidos")
    .select("endereco")
    .eq("restaurante_id", restauranteId)
    .eq("origem", "delivery")
    .neq("status", "cancelado")
    .not("endereco", "is", null)
    .order("criado_em", { ascending: false })
    .limit(PEDIDOS_PARA_SUGERIR);

  const cadastrados = new Set(jaCadastrados.map((b) => chaveBairro(b.nome)));
  // Conta por chave (sem acento, sem caixa) e guarda o nome mais recente como rótulo.
  const contagem = new Map<string, BairroSugerido>();
  for (const p of data ?? []) {
    const endereco = p.endereco as Record<string, string | null> | null;
    const nome = endereco?.bairro?.trim();
    const chave = chaveBairro(nome);
    if (!nome || !chave || cadastrados.has(chave)) continue;
    const atual = contagem.get(chave);
    if (atual) atual.pedidos += 1;
    else contagem.set(chave, { nome, pedidos: 1 });
  }
  return [...contagem.values()].sort((a, b) => b.pedidos - a.pedidos || a.nome.localeCompare(b.nome, "pt-BR"));
}
