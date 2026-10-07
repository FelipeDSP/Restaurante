"use server";

import { z } from "zod";

import { centavosDeTexto } from "@/lib/dinheiro";
import { ipDoCliente, limiteAtingido, registrarUso } from "@/lib/limite-taxa";
import { createPublicClient } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

import { buscarRestaurantePorSlug, MENSAGEM_FECHADO } from "../dados";

export type ResultadoPedido =
  | { ok: true; pedidoId: string }
  // atualizar: preço ou disponibilidade mudou; a tela recarrega o cardápio para o cliente conferir.
  | { ok: false; mensagem: string; erros?: Record<string, string>; atualizar?: boolean };

const pedidoSchema = z.object({
  itens: z
    .array(
      z.object({
        produtoId: id,
        quantidade: z.number().int().min(1).max(99),
        observacao: z.string().trim().max(300),
        adicionais: z.array(id).max(30).default([]),
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
  // Id do envio (gerado no aparelho): reenviar depois de uma falha devolve o mesmo pedido.
  chave: id,
  // Total que o cliente viu; se mudou, o pedido é recusado com aviso.
  totalEsperado: z.number().int().min(0),
});

export type DadosPedido = z.input<typeof pedidoSchema>;

const JANELA_LIMITE_MS = 10 * 60_000;
const LIMITE_POR_TELEFONE = 5;
const LIMITE_POR_IP = 20;

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

  // Contra pedidos falsos em série, contando só pedidos criados (erro de digitação não conta):
  // por telefone e, mais folgado, por IP (no 4G vários clientes saem pelo mesmo IP da operadora).
  const ip = await ipDoCliente();
  const chaveTelefone = `pedido:${restaurante.id}:tel:${d.telefone}`;
  const chaveIp = ip ? `pedido:${restaurante.id}:ip:${ip}` : null;
  if (
    limiteAtingido(chaveTelefone, LIMITE_POR_TELEFONE, JANELA_LIMITE_MS) ||
    (chaveIp && limiteAtingido(chaveIp, LIMITE_POR_IP, JANELA_LIMITE_MS))
  ) {
    return {
      ok: false,
      mensagem: "Recebemos vários pedidos seguidos deste aparelho. Aguarde alguns minutos ou fale com o restaurante pelo WhatsApp.",
    };
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
    p_itens: d.itens.map((i) => ({
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      observacao: i.observacao || null,
      adicionais: i.adicionais,
    })),
    p_troco_para: trocoPara ?? undefined,
    p_observacao: d.observacao || undefined,
    p_chave: d.chave,
    p_total_esperado: d.totalEsperado,
  });

  if (error) {
    if (error.code !== "P0001") return { ok: false, mensagem: "Não foi possível enviar o pedido. Tente novamente." };
    // "Restaurante não está recebendo pedidos agora (fora_do_horario)." -> mensagem amigável
    const motivo = MOTIVOS.find((m) => error.message.includes(`(${m})`));
    if (motivo) return { ok: false, mensagem: MENSAGEM_FECHADO[motivo] };
    const atualizar = /\((precos_mudaram|indisponivel)\)$/.test(error.message);
    return { ok: false, mensagem: error.message.replace(/\s*\((precos_mudaram|indisponivel)\)$/, ""), atualizar };
  }

  const pedidoId = (data as { id?: string } | null)?.id;
  if (!pedidoId) return { ok: false, mensagem: "Não foi possível enviar o pedido. Tente novamente." };
  registrarUso(chaveTelefone);
  if (chaveIp) registrarUso(chaveIp);
  return { ok: true, pedidoId };
}
