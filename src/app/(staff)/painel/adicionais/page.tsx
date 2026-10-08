import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { type Grupo, ListaGrupos, NovoGrupo } from "./lista-adicionais";

export const metadata: Metadata = { title: "Adicionais" };

export default async function AdicionaisPage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  // Sempre filtrar pelo restaurante ativo: a RLS também libera o cardápio público de outros restaurantes.
  const [grupos, ligacoes] = await Promise.all([
    supabase
      .from("grupos_adicionais")
      .select("id, nome, minimo, maximo, repetir, ativo, adicionais(id, nome, preco, disponivel, ordem)")
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ordem")
      .order("nome")
      .order("ordem", { referencedTable: "adicionais" })
      .order("nome", { referencedTable: "adicionais" }),
    supabase
      .from("produtos_grupos_adicionais")
      .select("grupo_id, produto:produtos!produtos_grupos_adicionais_restaurante_id_produto_id_fkey(id, nome)")
      .eq("restaurante_id", acesso.restaurante.id),
  ]);
  if (grupos.error) throw new Error(grupos.error.message);
  if (ligacoes.error) throw new Error(ligacoes.error.message);

  const lista: Grupo[] = grupos.data.map((g) => ({
    id: g.id,
    nome: g.nome,
    minimo: g.minimo,
    maximo: g.maximo,
    repetir: g.repetir,
    ativo: g.ativo,
    opcoes: g.adicionais.map((a) => ({ id: a.id, nome: a.nome, preco: a.preco, disponivel: a.disponivel })),
    produtos: ligacoes.data
      .filter((l) => l.grupo_id === g.id && l.produto)
      .map((l) => ({ id: l.produto!.id, nome: l.produto!.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Adicionais e opções</h1>
        <p className="text-muted-foreground">
          Crie grupos (ex.: ponto da carne, adicionais com preço) e ligue cada grupo aos produtos na tela do produto. O mesmo
          grupo pode ser usado em vários produtos.
        </p>
      </div>
      <NovoGrupo />
      <ListaGrupos grupos={lista} />
    </main>
  );
}
