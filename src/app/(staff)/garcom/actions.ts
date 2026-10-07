"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { novoRegistro } from "@/lib/supabase/insercao";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

// Todas as ações filtram pelo restaurante ativo; a RLS e os triggers fazem a validação final
// (caixa aberto, comanda aberta, preço do cadastro, quem registrou).

export async function abrirComanda(mesaId: string, pessoas: number | null): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ mesaId: id, pessoas: z.number().int().min(1).max(100).nullable() })
    .safeParse({ mesaId, pessoas });
  if (!dados.success) return falha("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .insert(novoRegistro("comandas", { restaurante_id: acesso.restaurante.id, mesa_id: dados.data.mesaId, pessoas: dados.data.pessoas }));
  if (error) {
    return falha(error.code === "23505" ? "Esta mesa já tem uma comanda aberta." : mensagemErroBanco(error));
  }

  refresh();
  return sucesso("Comanda aberta.");
}

const itensSchema = z
  .array(
    z.object({
      produtoId: id,
      quantidade: z.number().int().min(1).max(99),
      observacao: z.string().trim().max(300).nullable(),
      adicionais: z.array(id).max(30),
      paraViagem: z.boolean(),
    }),
  )
  .min(1, "Escolha pelo menos um item.")
  .max(50);

export async function lancarItens(
  comandaId: string,
  itens: { produtoId: string; quantidade: number; observacao: string | null; adicionais: string[]; paraViagem: boolean }[],
): Promise<ResultadoAcao> {
  await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");
  const dados = itensSchema.safeParse(itens);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Itens inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lancar_itens_comanda", {
    p_comanda_id: comandaId,
    p_itens: dados.data.map((i) => ({
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      observacao: i.observacao || null,
      adicionais: i.adicionais,
      para_viagem: i.paraViagem,
    })),
  });
  if (error) return falha(mensagemErroBanco(error));

  const quantidade = dados.data.reduce((soma, i) => soma + i.quantidade, 0);
  const numero = (data as { numero?: number } | null)?.numero;
  refresh();
  return sucesso(`Pedido${numero ? ` nº ${numero}` : ""} enviado: ${quantidade} ${quantidade === 1 ? "item" : "itens"}.`);
}

export async function alterarItem(itemId: string, quantidade: number, observacao: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ itemId: id, quantidade: z.number().int().min(1).max(99), observacao: z.string().trim().max(300) })
    .safeParse({ itemId, quantidade, observacao });
  if (!dados.success) return falha("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("itens_pedido")
    .update({ quantidade: dados.data.quantidade, observacao: dados.data.observacao || null })
    .eq("id", dados.data.itemId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Item atualizado.");
}

export async function cancelarItem(itemId: string, motivo: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ itemId: id, motivo: z.string().trim().min(3, "Informe o motivo.").max(500) })
    .safeParse({ itemId, motivo });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("itens_pedido")
    .update({ cancelado_em: new Date().toISOString(), motivo_cancelamento: dados.data.motivo })
    .eq("id", dados.data.itemId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Item cancelado.");
}

export async function alterarStatusConta(comandaId: string, contaPedida: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .update({ status: contaPedida ? "conta_pedida" : "aberta" })
    .eq("id", comandaId)
    .eq("restaurante_id", acesso.restaurante.id)
    .in("status", ["aberta", "conta_pedida"]);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(contaPedida ? "Conta pedida." : "Comanda reaberta.");
}

const FORMAS = ["dinheiro", "pix", "credito", "debito", "outro"] as const;

export async function registrarPagamento(comandaId: string, valor: number, forma: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ comandaId: id, valor: z.number().int().min(1, "Informe o valor."), forma: z.enum(FORMAS) })
    .safeParse({ comandaId, valor, forma });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase.from("pagamentos").insert(
    novoRegistro("pagamentos", {
      restaurante_id: acesso.restaurante.id,
      comanda_id: dados.data.comandaId,
      valor: dados.data.valor,
      forma: dados.data.forma,
    }),
  );
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(`Pagamento de ${formatarBRL(dados.data.valor)} registrado.`);
}

export async function estornarPagamento(pagamentoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (acesso.papel === "garcom") return falha("Só o caixa ou o dono podem estornar.");
  if (!id.safeParse(pagamentoId).success) return falha("Pagamento inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pagamentos")
    .update({ estornado_em: new Date().toISOString() })
    .eq("id", pagamentoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Pagamento estornado.");
}

export async function fecharComanda(comandaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .update({ status: "fechada" })
    .eq("id", comandaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Comanda fechada. Mesa liberada.");
}

export async function cancelarComanda(comandaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (acesso.papel === "garcom") return falha("Só o caixa ou o dono podem cancelar a comanda.");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .update({ status: "cancelada" })
    .eq("id", comandaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Comanda cancelada. Mesa liberada.");
}
