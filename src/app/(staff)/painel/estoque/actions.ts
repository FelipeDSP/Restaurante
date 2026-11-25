"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { dinheiro, id, textoObrigatorio, textoOpcional } from "@/lib/validacao";

// O saldo nunca é escrito daqui: entra tudo pelo extrato (RPCs movimentar_estoque e
// ajustar_estoque), que é quem trava a linha e guarda quem fez.

const UNIDADES = ["un", "kg", "g", "l", "ml"] as const;

// "1,5" e "1.5" valem o mesmo; o banco guarda com 3 casas.
const quantidade = (rotulo: string) =>
  z.preprocess(
    (valor) => (typeof valor === "string" ? Number(valor.replace(/\./g, "").replace(",", ".")) : valor),
    z.number({ error: `${rotulo}: informe um número.` }).finite().min(-99999999).max(99999999),
  );

const itemSchema = z.object({
  nome: textoObrigatorio("o nome", 80),
  unidade: z.enum(UNIDADES, { error: "Escolha a unidade." }),
  minimo: quantidade("Estoque mínimo").pipe(z.number().min(0, "O mínimo não pode ser negativo.")),
});

// Criar já diz quanto tem: antes o item nascia zerado ("Acabou" em vermelho) e a pessoa tinha que
// procurar o item na lista e dar entrada depois.
export async function criarItem(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  const dados = itemSchema.safeParse({
    nome: formData.get("nome"),
    unidade: formData.get("unidade"),
    minimo: "0",
  });
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const texto = String(formData.get("quantidade") ?? "").trim();
  const inicial = texto ? quantidade("Quantidade").safeParse(texto) : null;
  if (inicial && !inicial.success) return falha("Quantidade: informe um número.", { quantidade: "Informe um número." }, formData);

  const supabase = await createClient();
  const { data: criado, error } = await supabase
    .from("estoque_itens")
    .insert({ restaurante_id: acesso.restaurante.id, ...dados.data })
    .select("id")
    .single();
  if (error) {
    return falha(error.code === "23505" ? "Já existe um item com esse nome." : mensagemErroBanco(error), undefined, formData);
  }

  // A primeira contagem entra como ajuste ("você disse que tem 24"), com autor e hora no extrato.
  if (inicial?.success && inicial.data !== 0) {
    const { error: erro } = await supabase.rpc("ajustar_estoque", {
      p_item_id: criado.id,
      p_saldo: inicial.data,
      p_observacao: "Contagem ao cadastrar",
    });
    if (erro) {
      refresh();
      return { ok: true, id: criado.id, mensagem: "Item criado, mas a quantidade não entrou. Use Entrada.", chave: Date.now() };
    }
  }

  refresh();
  return { ok: true, id: criado.id, mensagem: "Item criado.", chave: Date.now() };
}

export async function salvarItem(itemId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success) return falha("Item inválido.");
  const dados = itemSchema.safeParse({
    nome: formData.get("nome"),
    unidade: formData.get("unidade"),
    minimo: formData.get("minimo") || "0",
  });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("estoque_itens")
    .update(dados.data)
    .eq("id", itemId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(error.code === "23505" ? "Já existe um item com esse nome." : mensagemErroBanco(error), undefined, formData);
  }

  refresh();
  return sucesso("Item salvo.");
}

export async function alternarItem(itemId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success) return falha("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("estoque_itens")
    .update({ ativo })
    .eq("id", itemId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativo ? "Item ligado." : "Item desligado: para de segurar o cardápio.");
}

export async function excluirItem(itemId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success) return falha("Item inválido.");

  const supabase = await createClient();
  const { error } = await supabase.from("estoque_itens").delete().eq("id", itemId).eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503"
        ? "Este item já tem movimentos no extrato e não pode ser excluído. Desligue-o."
        : mensagemErroBanco(error),
    );
  }

  refresh();
  return sucesso("Item excluído.");
}

// Entrada (compra), baixa (perda) e contagem (ajuste): tudo vira linha no extrato.
const movimentoSchema = z.object({
  quantidade: quantidade("Quantidade"),
  motivo: z.enum(["compra", "perda", "ajuste"], { error: "Motivo inválido." }),
  observacao: textoOpcional(300),
});

export async function movimentar(itemId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success) return falha("Item inválido.");
  const dados = movimentoSchema.safeParse({
    quantidade: formData.get("quantidade"),
    motivo: formData.get("motivo"),
    observacao: formData.get("observacao"),
  });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  // Quanto custou a compra (opcional), em centavos.
  const texto = String(formData.get("custo") ?? "").trim();
  const custo = texto ? dinheiro("Custo").safeParse(texto) : null;
  if (custo && !custo.success) return falha("Custo: use o formato 12,50.", undefined, formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("movimentar_estoque", {
    p_item_id: itemId,
    p_quantidade: dados.data.quantidade,
    p_motivo: dados.data.motivo,
    p_observacao: dados.data.observacao ?? undefined,
    p_custo_total: custo?.success ? custo.data : undefined,
  });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso(dados.data.motivo === "compra" ? "Entrada registrada." : "Baixa registrada.");
}

export async function contar(itemId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success) return falha("Item inválido.");
  const dados = z
    .object({ saldo: quantidade("Contagem"), observacao: textoOpcional(300) })
    .safeParse({ saldo: formData.get("saldo"), observacao: formData.get("observacao") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("ajustar_estoque", {
    p_item_id: itemId,
    p_saldo: dados.data.saldo,
    p_observacao: dados.data.observacao ?? undefined,
  });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Contagem registrada.");
}

// Ficha: em quais produtos este item sai, e quanto sai de cada vez.
const produtosSchema = z.preprocess((valor) => {
  try {
    return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
  } catch {
    return null;
  }
}, z.array(id, { error: "Produtos inválidos." }).max(1000));

export async function aplicarItemEmProdutos(
  itemId: string,
  produtosJson: string,
  quantidadePorProduto: number,
): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success) return falha("Item inválido.");
  const produtos = produtosSchema.safeParse(produtosJson);
  if (!produtos.success) return falha("Produtos inválidos.");
  const porProduto = Number(quantidadePorProduto);
  if (!Number.isFinite(porProduto) || porProduto <= 0) return falha("A quantidade precisa ser maior que zero.");

  const restauranteId = acesso.restaurante.id;
  const supabase = await createClient();
  const escolhidos = [...new Set(produtos.data)];

  const { data: atuais, error } = await supabase
    .from("produto_insumos")
    .select("produto_id")
    .eq("restaurante_id", restauranteId)
    .eq("item_id", itemId);
  if (error) return falha(mensagemErroBanco(error));

  const existentes = atuais.map((l) => l.produto_id);
  const remover = existentes.filter((p) => !escolhidos.includes(p));
  const incluir = escolhidos.filter((p) => !existentes.includes(p));

  if (remover.length > 0) {
    const { error: erro } = await supabase
      .from("produto_insumos")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("item_id", itemId)
      .in("produto_id", remover);
    if (erro) return falha(mensagemErroBanco(erro));
  }
  if (incluir.length > 0) {
    const { error: erro } = await supabase
      .from("produto_insumos")
      .insert(incluir.map((produtoId) => ({ restaurante_id: restauranteId, item_id: itemId, produto_id: produtoId, quantidade: porProduto })));
    if (erro) return falha(mensagemErroBanco(erro));
  }

  refresh();
  const total = escolhidos.length;
  return sucesso(total === 0 ? "Item saiu de todos os produtos." : `Item em ${total} ${total === 1 ? "produto" : "produtos"}.`);
}

export async function mudarQuantidadeDaFicha(
  itemId: string,
  produtoId: string,
  _estado: ResultadoAcao,
  formData: FormData,
): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(itemId).success || !id.safeParse(produtoId).success) return falha("Ficha inválida.");
  const dados = z
    .object({ quantidade: quantidade("Quantidade").pipe(z.number().positive("A quantidade precisa ser maior que zero.")) })
    .safeParse({ quantidade: formData.get("quantidade") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("produto_insumos")
    .update({ quantidade: dados.data.quantidade })
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("item_id", itemId)
    .eq("produto_id", produtoId);
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Ficha salva.");
}

// ---------------------------------------------------------------------------
// Pelo lado do produto (o dono não precisa saber o que é "item de estoque")
// ---------------------------------------------------------------------------

// "Controlar o estoque deste produto": cria o item com o nome do produto e liga 1 para 1.
export async function controlarEstoqueDoProduto(produtoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(produtoId).success) return falha("Produto inválido.");

  const restauranteId = acesso.restaurante.id;
  const supabase = await createClient();
  const { data: produto, error: erroProduto } = await supabase
    .from("produtos")
    .select("nome")
    .eq("id", produtoId)
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (erroProduto) return falha(mensagemErroBanco(erroProduto));
  if (!produto) return falha("Produto não encontrado.");

  // Já existe um item com esse nome? Usa ele em vez de duplicar.
  const { data: existente } = await supabase
    .from("estoque_itens")
    .select("id")
    .eq("restaurante_id", restauranteId)
    .eq("nome", produto.nome)
    .maybeSingle();

  let itemId = existente?.id;
  if (!itemId) {
    const { data: criado, error } = await supabase
      .from("estoque_itens")
      .insert({ restaurante_id: restauranteId, nome: produto.nome, unidade: "un" })
      .select("id")
      .single();
    if (error) return falha(mensagemErroBanco(error));
    itemId = criado.id;
  }

  const { error } = await supabase
    .from("produto_insumos")
    .insert({ restaurante_id: restauranteId, produto_id: produtoId, item_id: itemId, quantidade: 1 });
  if (error && error.code !== "23505") return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Estoque ligado. Dê a entrada do que você tem.");
}

export async function ligarInsumoNoProduto(produtoId: string, itemId: string, quantidadeTexto: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(produtoId).success || !id.safeParse(itemId).success) return falha("Insumo inválido.");
  const qtd = Number(String(quantidadeTexto).replace(",", "."));
  if (!Number.isFinite(qtd) || qtd <= 0) return falha("A quantidade precisa ser maior que zero.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("produto_insumos")
    .insert({ restaurante_id: acesso.restaurante.id, produto_id: produtoId, item_id: itemId, quantidade: qtd });
  if (error) return falha(error.code === "23505" ? "Este insumo já está no produto." : mensagemErroBanco(error));

  refresh();
  return sucesso("Insumo ligado ao produto.");
}

export async function desligarInsumoDoProduto(produtoId: string, itemId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "estoque");
  if (!id.safeParse(produtoId).success || !id.safeParse(itemId).success) return falha("Insumo inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("produto_insumos")
    .delete()
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("produto_id", produtoId)
    .eq("item_id", itemId);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Insumo desligado.");
}
