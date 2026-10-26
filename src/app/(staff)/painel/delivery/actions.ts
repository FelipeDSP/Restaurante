"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { avisarCliente } from "@/lib/avisos-push";
import { createClient } from "@/lib/supabase/server";
import { carregarCardapioSalao } from "../../garcom/dados";
import { id } from "@/lib/validacao";

const FORMAS = ["dinheiro", "pix", "credito", "debito", "outro"] as const;
const STATUS_AVANCO = ["em_preparo", "pronto", "saiu_entrega"] as const;
const ROTULO: Record<(typeof STATUS_AVANCO)[number], string> = {
  em_preparo: "Pedido aceito: em preparo.",
  pronto: "Pedido pronto.",
  saiu_entrega: "Pedido saiu para entrega.",
};

export async function avancarPedido(pedidoId: string, status: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "delivery");
  const dados = z.object({ pedidoId: id, status: z.enum(STATUS_AVANCO) }).safeParse({ pedidoId, status });
  if (!dados.success) return falha("Dados inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .update({ status: dados.data.status })
    .eq("id", dados.data.pedidoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("origem", "delivery")
    .not("status", "in", "(entregue,cancelado)")
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Pedido não encontrado ou já finalizado.");

  after(() => avisarCliente(dados.data.pedidoId));
  refresh();
  return sucesso(ROTULO[dados.data.status]);
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "delivery");
  const dados = z
    .object({ pedidoId: id, motivo: z.string().trim().min(3, "Informe o motivo.").max(500) })
    .safeParse({ pedidoId, motivo });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .update({ status: "cancelado", motivo_cancelamento: dados.data.motivo })
    .eq("id", dados.data.pedidoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("origem", "delivery")
    .not("status", "in", "(entregue,cancelado)")
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Pedido não encontrado ou já finalizado.");

  after(() => avisarCliente(dados.data.pedidoId));
  refresh();
  return sucesso("Pedido cancelado.");
}

export async function entregarPedido(pedidoId: string, forma: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "delivery");
  const dados = z.object({ pedidoId: id, forma: z.enum(FORMAS) }).safeParse({ pedidoId, forma });
  if (!dados.success) return falha("Escolha a forma de pagamento.");

  const supabase = await createClient();
  // Confere o restaurante ativo (o usuário pode pertencer a mais de um).
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id")
    .eq("id", dados.data.pedidoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .maybeSingle();
  if (!pedido) return falha("Pedido não encontrado.");

  // Pagamento + status numa transação (RPC); triggers exigem caixa aberto.
  const { error } = await supabase.rpc("entregar_pedido_delivery", {
    p_pedido_id: dados.data.pedidoId,
    p_forma: dados.data.forma,
  });
  if (error) return falha(mensagemErroBanco(error));

  after(() => avisarCliente(dados.data.pedidoId));
  refresh();
  return sucesso("Pedido entregue e pagamento registrado.");
}

// Escolhe (ou tira) o entregador do pedido; o valor dele vem do cadastro, pelo banco.
export async function definirEntregador(pedidoId: string, entregadorId: string | null): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "delivery");
  const dados = z.object({ pedidoId: id, entregadorId: id.nullable() }).safeParse({ pedidoId, entregadorId });
  if (!dados.success) return falha("Dados inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .update({ entregador_id: dados.data.entregadorId })
    .eq("id", dados.data.pedidoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("origem", "delivery")
    .not("status", "in", "(entregue,cancelado)")
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Pedido não encontrado ou já finalizado.");
  refresh();
  return sucesso(dados.data.entregadorId ? "Entregador definido." : "Entregador retirado.");
}

// Cardápio (com opções) e bairros para a janela de edição; carregados só quando ela abre.
export async function dadosParaEdicao() {
  const acesso = await exigirPermissao("painel", "delivery");
  const supabase = await createClient();
  const [cardapio, bairros] = await Promise.all([
    carregarCardapioSalao(acesso.restaurante.id),
    supabase
      .from("bairros_entrega")
      .select("id, nome, taxa")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("ativo", true)
      .order("nome"),
  ]);
  return { cardapio, bairros: bairros.data ?? [] };
}

const textoCurto = (max: number) => z.string().trim().max(max);
const edicaoSchema = z.object({
  pedidoId: id,
  campos: z
    .object({
      cliente_nome: textoCurto(120).min(2, "Informe o nome do cliente."),
      cliente_telefone: z.string().max(30),
      endereco: z.object({
        rua: textoCurto(200),
        numero: textoCurto(200),
        complemento: textoCurto(200),
        referencia: textoCurto(200),
        bairro: textoCurto(200),
      }).partial(),
      bairro_id: id.nullable(),
      taxa_entrega: z.number().int().min(0).max(100000),
      forma_pagamento_prevista: z.enum(FORMAS),
      troco_para: z.number().int().min(0).max(10_000_000).nullable(),
      observacao: textoCurto(500),
    })
    .partial(),
  remover: z.array(id).max(50),
  adicionar: z
    .array(
      z.object({
        produto_id: id,
        quantidade: z.number().int().min(1).max(99),
        observacao: textoCurto(300),
        adicionais: z.array(id).max(30),
      }),
    )
    .max(30),
  motivo: textoCurto(200),
});
export type EdicaoPedido = z.input<typeof edicaoSchema>;

// Quem tem o delivery edita um pedido em andamento; o banco valida, recalcula e registra.
export async function editarPedido(entrada: EdicaoPedido): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "delivery");
  const dados = edicaoSchema.safeParse(entrada);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  // O pedido precisa ser do restaurante ativo (o usuário pode pertencer a mais de um).
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id")
    .eq("id", dados.data.pedidoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("origem", "delivery")
    .maybeSingle();
  if (!pedido) return falha("Pedido não encontrado.");

  const { error } = await supabase.rpc("editar_pedido_delivery", {
    p_pedido_id: pedido.id,
    p_campos: dados.data.campos,
    p_remover: dados.data.remover,
    p_adicionar: dados.data.adicionar,
    p_motivo: dados.data.motivo,
  });
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Pedido atualizado.");
}
