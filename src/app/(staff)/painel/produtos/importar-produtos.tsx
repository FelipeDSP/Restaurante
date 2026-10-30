"use client";

import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/dinheiro";
import { centavosDaPlanilha, gerarCsv, lerPlanilha } from "@/lib/planilha";
import { cn } from "@/lib/utils";

import { importarProdutos } from "./importar-actions";

type ProdutoAtual = { nome: string; preco: number; categoria: string; descricao: string | null };
type Linha = {
  n: number;
  categoria: string;
  nome: string;
  descricao: string | null;
  preco: number | null;
  situacao: "novo" | "atualiza" | "igual" | "erro";
  precoAntes?: number;
  erro?: string;
};

const chave = (texto: string) => texto.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Colunas pelo título (em qualquer ordem): Categoria, Produto/Nome, Descrição, Preço/Valor.
function colunas(cabecalho: string[]) {
  const achar = (...nomes: string[]) => cabecalho.findIndex((c) => nomes.includes(semAcento(c)));
  return {
    categoria: achar("categoria", "grupo", "secao"),
    nome: achar("produto", "nome", "item", "nome do produto"),
    descricao: achar("descricao", "detalhes", "ingredientes"),
    preco: achar("preco", "valor", "preco (r$)", "valor (r$)", "preco de venda"),
  };
}

export function ImportarProdutos({ atuais }: { atuais: ProdutoAtual[] }) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const { pendente, executar } = useAcao();

  // "exemplo": planilha de mentira para ver como preencher; "atual": o cardápio de hoje, para editar.
  const baixar = (qual: "exemplo" | "atual") => {
    const corpo =
      qual === "atual"
        ? atuais.map((p) => [p.categoria, p.nome, p.descricao ?? "", (p.preco / 100).toFixed(2).replace(".", ",")])
        : [
            ["Lanches", "X-Burger", "Pão, carne 150 g, queijo e salada", "25,90"],
            ["", "X-Bacon", "Pão, carne 150 g, queijo e bacon", "29,90"],
            ["", "X-Tudo", "", "34,90"],
            ["Porções", "Batata frita", "Serve 2 pessoas", "22,00"],
            ["Bebidas", "Refrigerante lata", "350 ml", "6,00"],
            ["", "Suco natural", "Laranja ou limão, 500 ml", "9,50"],
          ];
    const url = URL.createObjectURL(gerarCsv([["Categoria", "Produto", "Descrição", "Preço"], ...corpo]));
    const a = document.createElement("a");
    a.href = url;
    a.download = qual === "atual" ? "cardapio.csv" : "exemplo-cardapio.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ler = async (arquivo: File) => {
    setErro(null);
    setLinhas(null);
    setNomeArquivo(arquivo.name);
    try {
      const tabela = (await lerPlanilha(arquivo)).filter((l) => l.some((c) => c.trim() !== ""));
      const inicio = tabela.findIndex((l) => {
        const c = colunas(l);
        return c.nome >= 0 && c.preco >= 0;
      });
      if (inicio < 0) {
        setErro('Não achamos as colunas "Produto" e "Preço". Baixe o exemplo e use os mesmos títulos.');
        return;
      }
      const col = colunas(tabela[inicio]);
      const porNome = new Map(atuais.map((p) => [chave(p.nome), p]));
      let ultimaCategoria = "";
      const resultado: Linha[] = tabela.slice(inicio + 1).map((l, i) => {
        const nome = (l[col.nome] ?? "").trim();
        // Categoria escrita uma vez vale para as linhas de baixo.
        const categoria = (col.categoria >= 0 ? (l[col.categoria] ?? "").trim() : "") || ultimaCategoria;
        if (categoria) ultimaCategoria = categoria;
        const descricao = col.descricao >= 0 ? (l[col.descricao] ?? "").trim() || null : null;
        const precoTexto = (l[col.preco] ?? "").trim();
        const preco = centavosDaPlanilha(precoTexto);
        const base = { n: inicio + i + 2, categoria, nome, descricao, preco };
        if (!nome) return { ...base, situacao: "erro" as const, erro: "Sem nome" };
        if (nome.length > 120) return { ...base, situacao: "erro" as const, erro: "Nome muito longo" };
        if (preco === null) return { ...base, situacao: "erro" as const, erro: precoTexto ? `Preço "${precoTexto}" inválido` : "Sem preço" };
        if (descricao && descricao.length > 500) return { ...base, situacao: "erro" as const, erro: "Descrição muito longa" };
        const atual = porNome.get(chave(nome));
        if (atual) {
          const muda = atual.preco !== preco || (descricao !== null && descricao !== atual.descricao);
          return { ...base, categoria: atual.categoria, situacao: muda ? ("atualiza" as const) : ("igual" as const), precoAntes: atual.preco };
        }
        if (!categoria) return { ...base, situacao: "erro" as const, erro: "Sem categoria" };
        if (categoria.length > 80) return { ...base, situacao: "erro" as const, erro: "Categoria muito longa" };
        return { ...base, situacao: "novo" as const };
      });
      if (resultado.length === 0) setErro("A planilha não tem produtos abaixo dos títulos.");
      else setLinhas(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  };

  const fechar = () => {
    setAberto(false);
    setLinhas(null);
    setErro(null);
  };

  if (!aberto) {
    return (
      <Button type="button" variant="outline" className="h-11" onClick={() => setAberto(true)}>
        <FileSpreadsheet />
        Importar planilha
      </Button>
    );
  }

  const validas = (linhas ?? []).filter((l) => l.situacao === "novo" || l.situacao === "atualiza");
  const conta = (s: Linha["situacao"]) => (linhas ?? []).filter((l) => l.situacao === s).length;
  const categoriasNovas = new Set(
    (linhas ?? []).filter((l) => l.situacao === "novo" && !atuais.some((p) => chave(p.categoria) === chave(l.categoria))).map((l) => chave(l.categoria)),
  ).size;

  return (
    <section className="flex w-full flex-col gap-4 rounded-xl border p-4" aria-labelledby="titulo-importar">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-importar" className="font-semibold">
          Importar planilha
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={fechar}>
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11" onClick={() => baixar("exemplo")}>
          <Download />
          Baixar exemplo
        </Button>
        {atuais.length > 0 ? (
          <Button type="button" variant="outline" className="h-11" onClick={() => baixar("atual")}>
            <Download />
            Baixar cardápio atual
          </Button>
        ) : null}
        <Button type="button" className="h-11" onClick={() => entrada.current?.click()}>
          <Upload />
          Escolher planilha
        </Button>
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) void ler(arquivo);
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">Colunas: Categoria, Produto, Descrição e Preço. Excel (.xlsx) ou CSV.</p>

      {erro ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          {erro}
        </p>
      ) : null}

      {linhas ? (
        <>
          <p className="text-sm">
            <strong>{nomeArquivo}</strong>: {conta("novo")} novos
            {categoriasNovas > 0 ? ` (${categoriasNovas} ${categoriasNovas === 1 ? "categoria nova" : "categorias novas"})` : ""}, {conta("atualiza")} com preço ou
            descrição novos, {conta("igual")} iguais{conta("erro") > 0 ? `, ${conta("erro")} com erro (ficam de fora)` : ""}.
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Linha</th>
                  <th className="px-2 py-1.5 font-medium">Categoria</th>
                  <th className="px-2 py-1.5 font-medium">Produto</th>
                  <th className="px-2 py-1.5 text-right font-medium">Preço</th>
                  <th className="px-2 py-1.5 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l) => (
                  <tr key={l.n} className={cn(l.situacao === "erro" && "bg-red-50", l.situacao === "igual" && "text-muted-foreground")}>
                    <td className="px-2 py-1.5 tabular-nums">{l.n}</td>
                    <td className="px-2 py-1.5">{l.categoria}</td>
                    <td className="px-2 py-1.5">{l.nome}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {l.precoAntes !== undefined && l.precoAntes !== l.preco ? (
                        <span className="mr-1 text-muted-foreground line-through">{formatarBRL(l.precoAntes)}</span>
                      ) : null}
                      {l.preco !== null ? formatarBRL(l.preco) : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      {l.situacao === "novo" ? (
                        <span className="font-medium text-green-800">Novo</span>
                      ) : l.situacao === "atualiza" ? (
                        <span className="font-medium text-amber-800">Atualiza</span>
                      ) : l.situacao === "igual" ? (
                        "Já está igual"
                      ) : (
                        <span className="text-red-900">{l.erro}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-11"
              disabled={pendente || validas.length === 0}
              onClick={() =>
                executar(
                  () =>
                    importarProdutos(
                      validas.map((l) => ({ categoria: l.categoria, nome: l.nome, descricao: l.descricao, preco: l.preco ?? 0 })),
                    ),
                  fechar,
                )
              }
            >
              {pendente ? "Importando..." : validas.length > 0 ? `Importar ${validas.length} ${validas.length === 1 ? "produto" : "produtos"}` : "Nada para importar"}
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setLinhas(null)}>
              Escolher outra
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
