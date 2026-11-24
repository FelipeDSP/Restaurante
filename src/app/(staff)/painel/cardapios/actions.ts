"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

// Dias da semana e produtos vêm em campos escondidos com JSON (ficam fora do <form>, que o
// React 19 reseta depois da ação).
function listaJson<T extends z.ZodTypeAny>(item: T, maximo: number) {
  return z.preprocess(
    (valor) => {
      try {
        return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
      } catch {
        return null;
      }
    },
    z.array(item).max(maximo),
  );
}

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use um horário como 11:00.");

const cardapioSchema = z.object({
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "O nome precisa de 2 letras.").max(60, "Máximo de 60 caracteres."),
  abre: hora,
  fecha: hora,
});

const diasSchema = listaJson(z.number().int().min(0).max(6), 7).refine(
  (dias) => dias.length > 0,
  "Escolha pelo menos um dia da semana.",
);

const produtosSchema = listaJson(id, 1000);

function dados(formData: FormData) {
  return {
    nome: formData.get("nome"),
    abre: formData.get("abre"),
    fecha: formData.get("fecha"),
  };
}

export async function criarCardapio(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  const campos = cardapioSchema.safeParse(dados(formData));
  if (!campos.success) return falhaValidacao(campos.error, formData);
  const dias = diasSchema.safeParse(formData.get("dias"));
  if (!dias.success) return falha("Escolha pelo menos um dia da semana.", undefined, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "cardapios", acesso.restaurante.id);
  const { data: criado, error } = await supabase
    .from("cardapios")
    .insert({ restaurante_id: acesso.restaurante.id, ...campos.data, dias: dias.data, ordem })
    .select("id")
    .single();
  if (error) {
    return falha(
      error.code === "23505" ? "Já existe um cardápio com esse nome." : mensagemErroBanco(error),
      undefined,
      formData,
    );
  }

  // Cardápio sem produto não esconde nada: já abre na tela de escolher os produtos.
  redirect(`/painel/cardapios/${criado.id}`);
}

export async function salvarCardapio(
  cardapioId: string,
  _estado: ResultadoAcao,
  formData: FormData,
): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(cardapioId).success) return falha("Cardápio inválido.");
  const campos = cardapioSchema.safeParse(dados(formData));
  if (!campos.success) return falhaValidacao(campos.error, formData);
  const dias = diasSchema.safeParse(formData.get("dias"));
  if (!dias.success) return falha("Escolha pelo menos um dia da semana.", undefined, formData);
  const produtos = produtosSchema.safeParse(formData.get("produtos"));
  if (!produtos.success) return falha("Produtos inválidos.", undefined, formData);

  const restauranteId = acesso.restaurante.id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("cardapios")
    .update({ ...campos.data, dias: dias.data })
    .eq("id", cardapioId)
    .eq("restaurante_id", restauranteId);
  if (error) {
    return falha(
      error.code === "23505" ? "Já existe um cardápio com esse nome." : mensagemErroBanco(error),
      undefined,
      formData,
    );
  }

  const escolhidos = [...new Set(produtos.data)];
  const { data: atuais, error: erroLer } = await supabase
    .from("cardapios_produtos")
    .select("produto_id")
    .eq("restaurante_id", restauranteId)
    .eq("cardapio_id", cardapioId);
  if (erroLer) return falha("Cardápio salvo, mas não foi possível atualizar os produtos.", undefined, formData);

  const existentes = atuais.map((l) => l.produto_id);
  const remover = existentes.filter((p) => !escolhidos.includes(p));
  const incluir = escolhidos.filter((p) => !existentes.includes(p));

  if (remover.length > 0) {
    const { error: erro } = await supabase
      .from("cardapios_produtos")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("cardapio_id", cardapioId)
      .in("produto_id", remover);
    if (erro) return falha("Cardápio salvo, mas não foi possível tirar os produtos.", undefined, formData);
  }
  if (incluir.length > 0) {
    const { error: erro } = await supabase
      .from("cardapios_produtos")
      .insert(incluir.map((produtoId) => ({ restaurante_id: restauranteId, cardapio_id: cardapioId, produto_id: produtoId })));
    if (erro) return falha("Cardápio salvo, mas não foi possível incluir os produtos.", undefined, formData);
  }

  refresh();
  return sucesso("Cardápio salvo.");
}

export async function alternarCardapio(cardapioId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(cardapioId).success) return falha("Cardápio inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("cardapios")
    .update({ ativo })
    .eq("id", cardapioId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativo ? "Cardápio ligado." : "Cardápio desligado: os produtos dele voltam a aparecer em qualquer horário.");
}

export async function moverCardapio(cardapioId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(cardapioId).success) return falha("Cardápio inválido.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "cardapios", acesso.restaurante.id, cardapioId, direcao);
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirCardapio(cardapioId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(cardapioId).success) return falha("Cardápio inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("cardapios")
    .delete()
    .eq("id", cardapioId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503"
        ? "Este cardápio já tem pedidos no histórico e não pode ser excluído. Desligue-o."
        : mensagemErroBanco(error),
    );
  }

  redirect("/painel/cardapios");
}
