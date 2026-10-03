"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

const STATUS_AVANCO = ["em_preparo", "pronto", "saiu_entrega"] as const;
const ROTULO: Record<(typeof STATUS_AVANCO)[number], string> = {
  em_preparo: "Pedido aceito: em preparo.",
  pronto: "Pedido pronto.",
  saiu_entrega: "Pedido saiu para entrega.",
};

export async function avancarPedido(pedidoId: string, status: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
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

  refresh();
  return sucesso(ROTULO[dados.data.status]);
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
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

  refresh();
  return sucesso("Pedido cancelado.");
}

const FORMAS = ["dinheiro", "pix", "credito", "debito", "outro"] as const;

export async function entregarPedido(pedidoId: string, forma: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
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

  refresh();
  return sucesso("Pedido entregue e pagamento registrado.");
}
