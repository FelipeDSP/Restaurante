"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

const nomeSchema = z.object({ nome: textoObrigatorio("o nome", 80) });

export async function criarCategoria(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
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
  const acesso = await exigirDono();
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
  const acesso = await exigirDono();
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
  const acesso = await exigirDono();
  if (!id.safeParse(categoriaId).success) return falha("Categoria inválida.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "categorias", acesso.restaurante.id, categoriaId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirCategoria(categoriaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
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
