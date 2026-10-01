"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { urlImagemDoRestaurante } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { checkbox, dadosDoFormulario, dinheiro, id, textoObrigatorio, textoOpcional } from "@/lib/validacao";

function produtoSchema(restauranteId: string) {
  return z.object({
    nome: textoObrigatorio("o nome", 120),
    descricao: textoOpcional(500),
    preco: dinheiro("Preço"),
    categoria_id: z.string().min(1, "Escolha a categoria.").pipe(id),
    foto_url: urlImagemDoRestaurante("rest-produtos", restauranteId),
    disponivel: checkbox,
    disponivel_delivery: checkbox,
  });
}

// produtoId vazio = novo produto.
export async function salvarProduto(
  produtoId: string | null,
  _estado: ResultadoAcao,
  formData: FormData,
): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const restauranteId = acesso.restaurante.id;

  const dados = produtoSchema(restauranteId).safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();

  if (produtoId) {
    if (!id.safeParse(produtoId).success) return falha("Produto inválido.", undefined, formData);

    // Mudou de categoria: vai para o fim da nova categoria.
    const { data: atual } = await supabase
      .from("produtos")
      .select("categoria_id")
      .eq("id", produtoId)
      .eq("restaurante_id", restauranteId)
      .single();
    const ordem =
      atual && atual.categoria_id !== dados.data.categoria_id
        ? { ordem: await proximaOrdem(supabase, "produtos", restauranteId, dados.data.categoria_id) }
        : {};

    const { error } = await supabase
      .from("produtos")
      .update({ ...dados.data, ...ordem })
      .eq("id", produtoId)
      .eq("restaurante_id", restauranteId);
    if (error) return falha(mensagemErroBanco(error), undefined, formData);
  } else {
    const ordem = await proximaOrdem(supabase, "produtos", restauranteId, dados.data.categoria_id);
    const { error } = await supabase
      .from("produtos")
      .insert({ ...dados.data, restaurante_id: restauranteId, ordem });
    if (error) return falha(mensagemErroBanco(error), undefined, formData);
  }

  redirect("/painel/produtos");
}

export async function alternarDisponibilidade(
  produtoId: string,
  campo: "disponivel" | "disponivel_delivery",
  valor: boolean,
): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(produtoId).success) return falha("Produto inválido.");
  if (campo !== "disponivel" && campo !== "disponivel_delivery") return falha("Campo inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("produtos")
    .update(campo === "disponivel" ? { disponivel: valor === true } : { disponivel_delivery: valor === true })
    .eq("id", produtoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return undefined;
}

export async function moverProduto(
  produtoId: string,
  categoriaId: string,
  direcao: "cima" | "baixo",
): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(produtoId).success || !id.safeParse(categoriaId).success) return falha("Produto inválido.");

  const supabase = await createClient();
  const erro = await moverItem(
    supabase,
    "produtos",
    acesso.restaurante.id,
    produtoId,
    direcao === "cima" ? "cima" : "baixo",
    categoriaId,
  );
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirProduto(produtoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(produtoId).success) return falha("Produto inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("produtos")
    .delete()
    .eq("id", produtoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503"
        ? "Este produto já foi vendido e não pode ser excluído. Marque como indisponível."
        : mensagemErroBanco(error),
    );
  }

  redirect("/painel/produtos");
}
