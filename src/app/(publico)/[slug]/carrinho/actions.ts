"use server";

import { z } from "zod";

import { centavosDeTexto } from "@/lib/dinheiro";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createPublicClient } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

import { buscarRestaurantePorSlug, MENSAGEM_FECHADO } from "../dados";

export type ResultadoPedido =
  | { ok: true; pedidoId: string }
  | { ok: false; mensagem: string; erros?: Record<string, string> };

const pedidoSchema = z.object({
  itens: z
    .array(
      z.object({
        produtoId: id,
        quantidade: z.number().int().min(1).max(99),
        observacao: z.string().trim().max(300),
      }),
    )
    .min(1, "Seu carrinho está vazio.")
    .max(50),
  nome: z.string().trim().min(2, "Informe seu nome.").max(120),
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().min(10, "Informe o telefone com DDD.").max(13, "Telefone inválido.")),
  bairroId: z.string().min(1, "Escolha o bairro.").pipe(id),
  rua: z.string().trim().min(2, "Informe a rua.").max(120),
  numero: z.string().trim().min(1, "Informe o número.").max(20),
  complemento: z.string().trim().max(120),
  referencia: z.string().trim().max(200),
  forma: z.enum(["dinheiro", "pix", "credito", "debito"], { error: "Escolha a forma de pagamento." }),
  trocoPara: z.string().trim().max(20),
  observacao: z.string().trim().max(500),
});

export type DadosPedido = z.input<typeof pedidoSchema>;

const MOTIVOS = Object.keys(MENSAGEM_FECHADO) as (keyof typeof MENSAGEM_FECHADO)[];

export async function enviarPedido(slug: string, entrada: DadosPedido): Promise<ResultadoPedido> {
  // O restaurante vem do slug no servidor, nunca de um id enviado pelo navegador.
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };

  const dados = pedidoSchema.safeParse(entrada);
  if (!dados.success) {
    const erros: Record<string, string> = {};
    for (const issue of dados.error.issues) erros[String(issue.path[0] ?? "_")] ??= issue.message;
    return { ok: false, mensagem: "Confira os dados do pedido.", erros };
  }
  const d = dados.data;

  let trocoPara: number | null = null;
  if (d.forma === "dinheiro" && d.trocoPara) {
    trocoPara = centavosDeTexto(d.trocoPara);
    if (trocoPara === null) return { ok: false, mensagem: "Confira o troco.", erros: { trocoPara: "Use o formato 50,00." } };
  }

  // Contra pedidos falsos em série: 5 pedidos a cada 10 minutos por IP e restaurante.
  if (!consumirLimite(`pedido:${restaurante.id}:${await ipDoCliente()}`, 5, 10 * 60_000)) {
    return { ok: false, mensagem: "Muitos pedidos seguidos. Aguarde alguns minutos ou fale com o restaurante." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("criar_pedido_delivery", {
    p_restaurante_id: restaurante.id,
    p_cliente_nome: d.nome,
    p_cliente_telefone: d.telefone,
    p_bairro_id: d.bairroId,
    p_endereco: {
      rua: d.rua,
      numero: d.numero,
      complemento: d.complemento || null,
      referencia: d.referencia || null,
    },
    p_forma_pagamento: d.forma,
    p_itens: d.itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade, observacao: i.observacao || null })),
    p_troco_para: trocoPara ?? undefined,
    p_observacao: d.observacao || undefined,
  });

  if (error) {
    if (error.code !== "P0001") return { ok: false, mensagem: "Não foi possível enviar o pedido. Tente novamente." };
    // "Restaurante não está recebendo pedidos agora (fora_do_horario)." -> mensagem amigável
    const motivo = MOTIVOS.find((m) => error.message.includes(`(${m})`));
    return { ok: false, mensagem: motivo ? MENSAGEM_FECHADO[motivo] : error.message };
  }

  const pedidoId = (data as { id?: string } | null)?.id;
  if (!pedidoId) return { ok: false, mensagem: "Não foi possível enviar o pedido. Tente novamente." };
  return { ok: true, pedidoId };
}
