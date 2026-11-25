import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { exigirPermissao, temPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { id as idSchema } from "@/lib/validacao";

import { carregarEstoqueDoProduto, estoqueSimplesDoProduto } from "../../estoque/dados";
import { EstoqueDoProduto } from "../../estoque/estoque-do-produto";

import { FormProduto } from "../form-produto";
import { carregarCardapiosParaProduto, carregarGruposParaProduto, carregarPracas } from "../grupos";

export const metadata: Metadata = { title: "Editar produto" };

export default async function EditarProdutoPage(props: PageProps<"/painel/produtos/[id]">) {
  const acesso = await exigirPermissao("painel", "cardapio");
  const { id } = await props.params;
  if (!idSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [produto, categorias, grupos, ligacoes, pracas, etapas, cardapios, cardapiosDoProduto] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, nome, descricao, preco, categoria_id, foto_url, disponivel, disponivel_delivery, para_viagem, dias")
      .eq("id", id)
      .eq("restaurante_id", acesso.restaurante.id)
      .maybeSingle(),
    supabase.from("categorias").select("id, nome").eq("restaurante_id", acesso.restaurante.id).order("ordem"),
    carregarGruposParaProduto(supabase, acesso.restaurante.id),
    supabase
      .from("produtos_grupos_adicionais")
      .select("grupo_id")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("produto_id", id),
    carregarPracas(supabase, acesso.restaurante.id),
    supabase
      .from("produto_etapas")
      .select("estacao_id, ordem")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("produto_id", id),
    carregarCardapiosParaProduto(supabase, acesso.restaurante.id),
    supabase
      .from("cardapios_produtos")
      .select("cardapio_id")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("produto_id", id),
  ]);
  if (cardapiosDoProduto.error) throw new Error(cardapiosDoProduto.error.message);

  // Só para quem cuida do estoque (e cujo plano tem o módulo).
  const cuidaDoEstoque = temPermissao(acesso, "estoque");
  const [estoque, estoqueSimples] = await Promise.all([
    cuidaDoEstoque ? carregarEstoqueDoProduto(supabase, acesso.restaurante.id, id) : null,
    cuidaDoEstoque ? estoqueSimplesDoProduto(supabase, acesso.restaurante.id, id) : null,
  ]);
  if (etapas.error) throw new Error(etapas.error.message);
  if (ligacoes.error) throw new Error(ligacoes.error.message);
  if (produto.error) throw new Error(produto.error.message);
  if (categorias.error) throw new Error(categorias.error.message);
  if (!produto.data) notFound();

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Editar produto</h1>
      <FormProduto
        restauranteId={acesso.restaurante.id}
        categorias={categorias.data}
        produto={produto.data}
        grupos={grupos}
        gruposDoProduto={ligacoes.data.map((l) => l.grupo_id)}
        pracas={pracas}
        etapasDoProduto={etapas.data}
        cardapios={cardapios}
        cardapiosDoProduto={cardapiosDoProduto.data.map((l) => l.cardapio_id)}
        estoque={estoqueSimples}
      />
      {/* Controle por ingrediente: só aparece para quem já usa — o caminho simples é o campo
          "Estoque" ali em cima. Fica fora do <form> porque cada mudança vale na hora. */}
      {estoque && estoqueSimples === null ? (
        <EstoqueDoProduto produtoId={id} insumos={estoque.insumos} disponiveis={estoque.disponiveis} />
      ) : null}
    </main>
  );
}
