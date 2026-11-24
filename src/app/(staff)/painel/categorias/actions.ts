"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

const nomeSchema = z.object({ nome: textoObrigatorio("o nome", 80) });

export async function criarCategoria(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  const dados = nomeSchema.safeParse({ nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "categorias", acesso.restaurante.id);
  const { error } = await supabase
    .from("categorias")
    .insert({ restaurante_id: acesso.restaurante.id, nome: dados.data.nome, ordem });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Categoria criada.");
}

export async function renomearCategoria(
  categoriaId: string,
  _estado: ResultadoAcao,
  formData: FormData,
): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  const dados = z.object({ id, nome: textoObrigatorio("o nome", 80) }).safeParse({
    id: categoriaId,
    nome: formData.get("nome"),
  });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categorias")
    .update({ nome: dados.data.nome })
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Categoria renomeada.");
}

export async function alternarCategoria(categoriaId: string, ativa: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(categoriaId).success) return falha("Categoria inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("categorias")
    .update({ ativa })
    .eq("id", categoriaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativa ? "Categoria ativada." : "Categoria desativada.");
}

export async function moverCategoria(categoriaId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(categoriaId).success) return falha("Categoria inválida.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "categorias", acesso.restaurante.id, categoriaId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirCategoria(categoriaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(categoriaId).success) return falha("Categoria inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", categoriaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503"
        ? "A categoria tem produtos. Mova ou exclua os produtos, ou desative a categoria."
        : mensagemErroBanco(error),
    );
  }

  refresh();
  return sucesso("Categoria excluída.");
}

// Criada de dentro do formulário de produto (sem sair da tela): devolve o id para já selecionar.
export async function criarCategoriaRapida(nome: string): Promise<{ ok: boolean; mensagem?: string; id?: string }> {
  const acesso = await exigirPermissao("painel", "cardapio");
  const dados = nomeSchema.safeParse({ nome });
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Informe o nome." };

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "categorias", acesso.restaurante.id);
  const { data, error } = await supabase
    .from("categorias")
    .insert({ restaurante_id: acesso.restaurante.id, nome: dados.data.nome, ordem })
    .select("id")
    .single();
  if (error) return { ok: false, mensagem: mensagemErroBanco(error) };
  return { ok: true, id: data.id, mensagem: `Categoria ${dados.data.nome} criada.` };
}

// Trazer produtos de outras categorias para esta. Não é "marcar": o produto tem uma categoria só,
// então aqui ele muda de lugar (e vai para o fim desta categoria, como no cadastro do produto).
const produtosSchema = z.preprocess((valor) => {
  try {
    return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
  } catch {
    return null;
  }
}, z.array(id, { error: "Produtos inválidos." }).min(1, "Escolha pelo menos um produto.").max(500));

export async function trazerProdutosParaCategoria(categoriaId: string, produtosJson: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(categoriaId).success) return falha("Categoria inválida.");
  const produtos = produtosSchema.safeParse(produtosJson);
  if (!produtos.success) return falha(produtos.error.issues[0]?.message ?? "Produtos inválidos.");

  const restauranteId = acesso.restaurante.id;
  const supabase = await createClient();
  const escolhidos = [...new Set(produtos.data)];
  let ordem = await proximaOrdem(supabase, "produtos", restauranteId, { coluna: "categoria_id", valor: categoriaId });

  for (const produtoId of escolhidos) {
    const { error } = await supabase
      .from("produtos")
      .update({ categoria_id: categoriaId, ordem })
      .eq("id", produtoId)
      .eq("restaurante_id", restauranteId)
      .neq("categoria_id", categoriaId);
    if (error) return falha(mensagemErroBanco(error));
    ordem += 1;
  }

  refresh();
  return sucesso(`${escolhidos.length} ${escolhidos.length === 1 ? "produto movido" : "produtos movidos"}.`);
}
