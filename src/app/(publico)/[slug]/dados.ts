import "server-only";

import { cache } from "react";

import type { AdicionalEscolhido, GrupoAdicionais } from "@/lib/adicionais";
import { carregarAdicionaisPorProduto } from "@/lib/adicionais-dados";
import { lerHorarios } from "@/lib/horarios";
import { createPublicClient } from "@/lib/supabase/publico";

export type RestaurantePublico = {
  id: string;
  slug: string;
  nome: string;
  logoUrl: string | null;
  corPrimaria: string;
  corSecundaria: string;
  telefone: string | null;
  whatsapp: string | null;
  endereco: Record<string, string | null>;
  fusoHorario: string;
  horarios: ReturnType<typeof lerHorarios>;
  aceitaDelivery: boolean;
  pedidoMinimo: number;
  tempoEstimadoMin: number | null;
};

// Restaurante pelo slug da URL. Toda a lógica usa o restaurante resolvido, nunca o formato da URL
// (no futuro, subdomínio/domínio próprio vão resolver para o mesmo restaurante).
export const buscarRestaurantePorSlug = cache(async (slug: string): Promise<RestaurantePublico | null> => {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("restaurantes_publicos")
    .select(
      "id, slug, nome, logo_url, cor_primaria, cor_secundaria, telefone, whatsapp, endereco, fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!data?.id || !data.nome || !data.slug) return null;

  return {
    id: data.id,
    slug: data.slug,
    nome: data.nome,
    logoUrl: data.logo_url,
    corPrimaria: data.cor_primaria ?? "#111827",
    corSecundaria: data.cor_secundaria ?? "#f59e0b",
    telefone: data.telefone,
    whatsapp: data.whatsapp,
    endereco:
      data.endereco && typeof data.endereco === "object" && !Array.isArray(data.endereco)
        ? (data.endereco as Record<string, string | null>)
        : {},
    fusoHorario: data.fuso_horario ?? "America/Sao_Paulo",
    horarios: lerHorarios(data.horarios),
    aceitaDelivery: data.aceita_delivery ?? false,
    pedidoMinimo: data.pedido_minimo ?? 0,
    tempoEstimadoMin: data.tempo_estimado_entrega_min,
  };
});

export type ProdutoPublico = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  fotoUrl: string | null;
  grupos: GrupoAdicionais[];
};

export type CategoriaPublica = { id: string; nome: string; produtos: ProdutoPublico[] };

// Cardápio do delivery: a RLS de anon já limita a produtos disponíveis no delivery.
export async function carregarCardapioDelivery(restauranteId: string): Promise<CategoriaPublica[]> {
  const supabase = createPublicClient();
  const adicionais = carregarAdicionaisPorProduto(supabase, restauranteId);
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, produtos(id, nome, descricao, preco, foto_url, ordem)")
    .eq("restaurante_id", restauranteId)
    .eq("ativa", true)
    .order("ordem")
    .order("ordem", { referencedTable: "produtos" })
    .order("nome", { referencedTable: "produtos" });
  if (error) throw new Error(error.message);
  const gruposPorProduto = await adicionais;

  return data
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      produtos: c.produtos.map((p) => ({
        id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
        fotoUrl: p.foto_url,
        grupos: gruposPorProduto.get(p.id) ?? [],
      })),
    }))
    .filter((c) => c.produtos.length > 0);
}

export type BairroPublico = { id: string; nome: string; taxa: number };

export async function carregarBairros(restauranteId: string): Promise<BairroPublico[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("bairros_entrega")
    .select("id, nome, taxa")
    .eq("restaurante_id", restauranteId)
    .order("nome");
  if (error) throw new Error(error.message);
  return data;
}

export type Disponibilidade = {
  aberto: boolean;
  motivo: "restaurante_indisponivel" | "sem_delivery" | "fora_do_horario" | "caixa_fechado" | null;
};

export async function consultarDisponibilidade(restauranteId: string): Promise<Disponibilidade> {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("consultar_disponibilidade_delivery", { p_restaurante_id: restauranteId });
  return (data as Disponibilidade | null) ?? { aberto: false, motivo: "restaurante_indisponivel" };
}

export const MENSAGEM_FECHADO: Record<NonNullable<Disponibilidade["motivo"]>, string> = {
  restaurante_indisponivel: "Restaurante indisponível no momento.",
  sem_delivery: "Este restaurante não está fazendo delivery pelo site.",
  fora_do_horario: "Estamos fechados agora. Confira os horários abaixo.",
  caixa_fechado: "Ainda não estamos recebendo pedidos. Tente novamente em instantes.",
};

export type PedidoPublico = {
  id: string;
  restaurante_id: string;
  numero: number;
  status: "recebido" | "em_preparo" | "pronto" | "saiu_entrega" | "entregue" | "cancelado";
  criado_em: string;
  subtotal: number;
  taxa_entrega: number;
  total: number;
  forma_pagamento_prevista: string | null;
  troco_para: number | null;
  motivo_cancelamento: string | null;
  tempo_estimado_entrega_min: number | null;
  itens: {
    nome_produto: string;
    quantidade: number;
    preco_unitario: number;
    preco_adicionais: number;
    adicionais: Omit<AdicionalEscolhido, "id">[];
    total: number;
    observacao: string | null;
  }[];
};

export async function consultarPedido(pedidoId: string): Promise<PedidoPublico | null> {
  const supabase = createPublicClient();
  const { data } = await supabase.rpc("consultar_pedido_publico", { p_pedido_id: pedidoId });
  return (data as PedidoPublico | null) ?? null;
}
