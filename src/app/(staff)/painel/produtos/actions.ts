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

// Grupos de opções ligados ao produto (campo oculto com JSON de ids).
const gruposSchema = z.preprocess((valor) => {
  try {
    return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
  } catch {
    return null;
  }
}, z.array(id, { error: "Grupos inválidos." }).max(30));

// Rota de preparo (campo oculto com JSON): praças distintas, ordem de 1 a 10.
const etapasSchema = z.preprocess(
  (valor) => {
    try {
      return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
    } catch {
      return null;
    }
  },
  z
    .array(z.object({ estacao_id: id, ordem: z.number().int().min(1).max(10) }), { error: "Rota de preparo inválida." })
    .max(10)
    .refine((lista) => new Set(lista.map((e) => e.estacao_id)).size === lista.length, "Cada praça só pode aparecer uma vez."),
);

// Troca a rota de preparo do produto pela lista enviada.
async function salvarEtapas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
  produtoId: string,
  etapas: { estacao_id: string; ordem: number }[],
): Promise<string | null> {
  const { error } = await supabase
    .from("produto_etapas")
    .delete()
    .eq("restaurante_id", restauranteId)
    .eq("produto_id", produtoId);
  if (error) return error.message;
  if (etapas.length === 0) return null;
  const { error: erro } = await supabase
    .from("produto_etapas")
    .insert(etapas.map((e) => ({ restaurante_id: restauranteId, produto_id: produtoId, ...e })));
  return erro?.message ?? null;
}

// Deixa as ligações produto-grupo iguais à lista escolhida.
async function sincronizarGrupos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
  produtoId: string,
  grupos: string[],
): Promise<string | null> {
  const { data: atuais, error } = await supabase
    .from("produtos_grupos_adicionais")
    .select("grupo_id")
    .eq("restaurante_id", restauranteId)
    .eq("produto_id", produtoId);
  if (error) return error.message;

  const existentes = atuais.map((l) => l.grupo_id);
  const remover = existentes.filter((g) => !grupos.includes(g));
  const incluir = grupos.filter((g) => !existentes.includes(g));

  if (remover.length > 0) {
    const { error: erro } = await supabase
      .from("produtos_grupos_adicionais")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("produto_id", produtoId)
      .in("grupo_id", remover);
    if (erro) return erro.message;
  }
  if (incluir.length > 0) {
    const { error: erro } = await supabase
      .from("produtos_grupos_adicionais")
      .insert(incluir.map((grupoId) => ({ restaurante_id: restauranteId, produto_id: produtoId, grupo_id: grupoId })));
    if (erro) return erro.message;
  }
  return null;
}

function produtoSchema(restauranteId: string) {
  return z.object({
    nome: textoObrigatorio("o nome", 120),
    descricao: textoOpcional(500),
    preco: dinheiro("Preço"),
    categoria_id: z.string().min(1, "Escolha a categoria.").pipe(id),
    foto_url: urlImagemDoRestaurante("rest-produtos", restauranteId),
    disponivel: checkbox,
    disponivel_delivery: checkbox,
    para_viagem: checkbox,
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
  const grupos = gruposSchema.safeParse(formData.get("grupos"));
  if (!grupos.success) return falha("Grupos de adicionais inválidos.", undefined, formData);
  const etapas = etapasSchema.safeParse(formData.get("etapas"));
  if (!etapas.success) {
    return falha("Confira a rota de preparo.", { etapas: etapas.error.issues[0]?.message ?? "Rota inválida." }, formData);
  }

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
        ? { ordem: await proximaOrdem(supabase, "produtos", restauranteId, { coluna: "categoria_id", valor: dados.data.categoria_id }) }
        : {};

    const { error } = await supabase
      .from("produtos")
      .update({ ...dados.data, ...ordem })
      .eq("id", produtoId)
      .eq("restaurante_id", restauranteId);
    if (error) return falha(mensagemErroBanco(error), undefined, formData);
    if (await sincronizarGrupos(supabase, restauranteId, produtoId, grupos.data)) {
      return falha("Produto salvo, mas não foi possível atualizar os adicionais.", undefined, formData);
    }
    if (await salvarEtapas(supabase, restauranteId, produtoId, etapas.data)) {
      return falha("Produto salvo, mas não foi possível atualizar a rota de preparo.", undefined, formData);
    }
  } else {
    const ordem = await proximaOrdem(supabase, "produtos", restauranteId, { coluna: "categoria_id", valor: dados.data.categoria_id });
    const { data: criado, error } = await supabase
      .from("produtos")
      .insert({ ...dados.data, restaurante_id: restauranteId, ordem })
      .select("id")
      .single();
    if (error) return falha(mensagemErroBanco(error), undefined, formData);
    if (await sincronizarGrupos(supabase, restauranteId, criado.id, grupos.data)) {
      return falha("Produto criado, mas não foi possível ligar os adicionais. Edite o produto para tentar de novo.");
    }
    if (await salvarEtapas(supabase, restauranteId, criado.id, etapas.data)) {
      return falha("Produto criado, mas não foi possível salvar a rota de preparo. Edite o produto para tentar de novo.");
    }
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
    { coluna: "categoria_id", valor: categoriaId },
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
