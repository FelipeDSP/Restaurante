"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
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

// Cardápios por horário ligados ao produto (campo oculto com JSON de ids).
const cardapiosSchema = z.preprocess((valor) => {
  try {
    return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
  } catch {
    return null;
  }
}, z.array(id, { error: "Cardápios inválidos." }).max(20));

// Dias da semana em que o produto aparece. Vazio = todos os dias (null no banco).
const diasSchema = z.preprocess(
  (valor) => {
    try {
      return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
    } catch {
      return null;
    }
  },
  z.array(z.number().int().min(0).max(6), { error: "Dias inválidos." }).max(7),
);

// Deixa as ligações produto-cardápio iguais à lista escolhida.
async function sincronizarCardapios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
  produtoId: string,
  cardapios: string[],
): Promise<string | null> {
  const { data: atuais, error } = await supabase
    .from("cardapios_produtos")
    .select("cardapio_id")
    .eq("restaurante_id", restauranteId)
    .eq("produto_id", produtoId);
  if (error) return error.message;

  const existentes = atuais.map((l) => l.cardapio_id);
  const remover = existentes.filter((c) => !cardapios.includes(c));
  const incluir = cardapios.filter((c) => !existentes.includes(c));

  if (remover.length > 0) {
    const { error: erro } = await supabase
      .from("cardapios_produtos")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("produto_id", produtoId)
      .in("cardapio_id", remover);
    if (erro) return erro.message;
  }
  if (incluir.length > 0) {
    const { error: erro } = await supabase
      .from("cardapios_produtos")
      .insert(incluir.map((cardapioId) => ({ restaurante_id: restauranteId, produto_id: produtoId, cardapio_id: cardapioId })));
    if (erro) return erro.message;
  }
  return null;
}

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

// Estoque do jeito simples (decisão do cliente em 25/11, olhando o concorrente): um campo de
// quantidade no próprio produto. Por baixo é a mesma mecânica do estoque — um item com o nome do
// produto, que sai 1 por venda —, mas quem só quer contar unidade não precisa saber disso.
// Quem controla por ingrediente usa a tela de Estoque; aí este campo não aparece.
async function definirEstoqueDoProduto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restauranteId: string,
  produtoId: string,
  nomeProduto: string,
  saldo: number,
): Promise<string | null> {
  const { data: ficha, error } = await supabase
    .from("produto_insumos")
    .select("item_id")
    .eq("restaurante_id", restauranteId)
    .eq("produto_id", produtoId);
  if (error) return error.message;
  // Ficha com mais de um insumo é controle por ingrediente: não mexe por aqui.
  if (ficha.length > 1) return null;

  let itemId: string | undefined = ficha[0]?.item_id;
  if (!itemId) {
    const { data: existente } = await supabase
      .from("estoque_itens")
      .select("id")
      .eq("restaurante_id", restauranteId)
      .ilike("nome", nomeProduto)
      .maybeSingle();
    itemId = existente?.id;
    if (!itemId) {
      const { data: criado, error: erro } = await supabase
        .from("estoque_itens")
        .insert({ restaurante_id: restauranteId, nome: nomeProduto, unidade: "un" })
        .select("id")
        .single();
      if (erro) return erro.message;
      itemId = criado.id;
    }
    const { error: erroFicha } = await supabase
      .from("produto_insumos")
      .insert({ restaurante_id: restauranteId, produto_id: produtoId, item_id: itemId, quantidade: 1 });
    if (erroFicha && erroFicha.code !== "23505") return erroFicha.message;
  }

  const { error: erroSaldo } = await supabase.rpc("ajustar_estoque", {
    p_item_id: itemId,
    p_saldo: saldo,
    p_observacao: "Contagem pelo cadastro do produto",
  });
  return erroSaldo?.message ?? null;
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
  const acesso = await exigirPermissao("painel", "cardapio");
  const restauranteId = acesso.restaurante.id;

  const dados = produtoSchema(restauranteId).safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const grupos = gruposSchema.safeParse(formData.get("grupos"));
  if (!grupos.success) return falha("Grupos de adicionais inválidos.", undefined, formData);
  const etapas = etapasSchema.safeParse(formData.get("etapas"));
  if (!etapas.success) {
    return falha("Confira a rota de preparo.", { etapas: etapas.error.issues[0]?.message ?? "Rota inválida." }, formData);
  }
  const cardapios = cardapiosSchema.safeParse(formData.get("cardapios"));
  if (!cardapios.success) return falha("Cardápios inválidos.", undefined, formData);
  const dias = diasSchema.safeParse(formData.get("dias"));
  if (!dias.success) return falha("Dias da semana inválidos.", undefined, formData);
  // Todos os dias marcados é o mesmo que não escolher dia.
  const lista = [...new Set(dias.data)].sort((a, b) => a - b);
  const diasDoProduto = lista.length === 0 || lista.length === 7 ? null : lista;

  // Quantidade em estoque digitada no próprio produto (em branco = não mexe).
  const textoEstoque = String(formData.get("estoque") ?? "").trim();
  const estoque = textoEstoque ? Number(textoEstoque.replace(/\./g, "").replace(",", ".")) : null;
  if (estoque !== null && !Number.isFinite(estoque)) {
    return falha("Estoque: informe um número.", { estoque: "Informe um número." }, formData);
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
      .update({ ...dados.data, dias: diasDoProduto, ...ordem })
      .eq("id", produtoId)
      .eq("restaurante_id", restauranteId);
    if (error) return falha(mensagemErroBanco(error), undefined, formData);
    if (await sincronizarGrupos(supabase, restauranteId, produtoId, grupos.data)) {
      return falha("Produto salvo, mas não foi possível atualizar os adicionais.", undefined, formData);
    }
    if (await salvarEtapas(supabase, restauranteId, produtoId, etapas.data)) {
      return falha("Produto salvo, mas não foi possível atualizar a rota de preparo.", undefined, formData);
    }
    if (await sincronizarCardapios(supabase, restauranteId, produtoId, cardapios.data)) {
      return falha("Produto salvo, mas não foi possível atualizar os cardápios.", undefined, formData);
    }
    if (estoque !== null && (await definirEstoqueDoProduto(supabase, restauranteId, produtoId, dados.data.nome, estoque))) {
      return falha("Produto salvo, mas não foi possível atualizar o estoque.", undefined, formData);
    }
  } else {
    const ordem = await proximaOrdem(supabase, "produtos", restauranteId, { coluna: "categoria_id", valor: dados.data.categoria_id });
    const { data: criado, error } = await supabase
      .from("produtos")
      .insert({ ...dados.data, dias: diasDoProduto, restaurante_id: restauranteId, ordem })
      .select("id")
      .single();
    if (error) return falha(mensagemErroBanco(error), undefined, formData);
    if (await sincronizarGrupos(supabase, restauranteId, criado.id, grupos.data)) {
      return falha("Produto criado, mas não foi possível ligar os adicionais. Edite o produto para tentar de novo.");
    }
    if (await salvarEtapas(supabase, restauranteId, criado.id, etapas.data)) {
      return falha("Produto criado, mas não foi possível salvar a rota de preparo. Edite o produto para tentar de novo.");
    }
    if (await sincronizarCardapios(supabase, restauranteId, criado.id, cardapios.data)) {
      return falha("Produto criado, mas não foi possível ligar os cardápios. Edite o produto para tentar de novo.");
    }
    if (estoque !== null && (await definirEstoqueDoProduto(supabase, restauranteId, criado.id, dados.data.nome, estoque))) {
      return falha("Produto criado, mas não foi possível gravar o estoque. Edite o produto para tentar de novo.");
    }
  }

  redirect("/painel/produtos");
}

export async function alternarDisponibilidade(
  produtoId: string,
  campo: "disponivel" | "disponivel_delivery",
  valor: boolean,
): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
