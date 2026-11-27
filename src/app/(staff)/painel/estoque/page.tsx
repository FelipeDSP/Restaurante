import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { carregarEstoque } from "@/modulos/estoque/dados";
import { Estoque } from "@/modulos/estoque/lista-estoque";

export const metadata: Metadata = { title: "Estoque" };

export default async function EstoquePage() {
  const acesso = await exigirPermissao("painel", "estoque");
  const { itens, categorias } = await carregarEstoque(acesso.restaurante.id);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Estoque</h1>
      <Estoque itens={itens} fuso={acesso.restaurante.fusoHorario} categorias={categorias} />
    </main>
  );
}
