"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, Campo, ErroCampo, marcadoCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { UploadImagem } from "@/components/staff/upload-imagem";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { regraDoGrupo } from "@/lib/adicionais";
import { textoDeCentavos } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { criarCategoriaRapida } from "../categorias/actions";
import { excluirProduto, salvarProduto } from "./actions";
import { EditorRota, type EtapaEditavel, etapasDoBanco, etapasParaBanco } from "./editor-rota";

export type ProdutoEditavel = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  categoria_id: string;
  foto_url: string | null;
  disponivel: boolean;
  disponivel_delivery: boolean;
  para_viagem: boolean;
};

export type GrupoParaProduto = { id: string; nome: string; minimo: number; maximo: number; ativo: boolean; opcoes: string[] };

type Props = {
  restauranteId: string;
  categorias: { id: string; nome: string }[];
  produto?: ProdutoEditavel;
  categoriaInicial?: string;
  grupos: GrupoParaProduto[];
  gruposDoProduto?: string[];
  pracas: { id: string; nome: string }[];
  etapasDoProduto?: { estacao_id: string; ordem: number }[];
};

export function FormProduto({
  restauranteId,
  categorias,
  produto,
  categoriaInicial,
  grupos,
  gruposDoProduto = [],
  pracas,
  etapasDoProduto = [],
}: Props) {
  const [estado, acao] = useActionState(salvarProduto.bind(null, produto?.id ?? null), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  // Fora do <form>: sobrevive à remontagem após erro (o React 19 reseta o formulário).
  const [gruposEscolhidos, setGruposEscolhidos] = useState<string[]>(gruposDoProduto);
  const [etapas, setEtapas] = useState<EtapaEditavel[]>(() => etapasDoBanco(etapasDoProduto));
  // Categorias criadas aqui mesmo entram na lista e já ficam escolhidas.
  const [criadas, setCriadas] = useState<{ id: string; nome: string }[]>([]);
  const [categoriaNova, setCategoriaNova] = useState<string | undefined>(undefined);
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [nomeCategoria, setNomeCategoria] = useState("");
  const listaCategorias = [...categorias, ...criadas.filter((c) => !categorias.some((x) => x.id === c.id))];

  function criarCategoria() {
    const nome = nomeCategoria.trim();
    executar(async () => {
      const r = await criarCategoriaRapida(nome);
      if (r.ok && r.id) {
        setCriadas((atual) => [...atual, { id: r.id!, nome }]);
        setCategoriaNova(r.id);
        setCriandoCategoria(false);
        setNomeCategoria("");
      }
      return { ok: r.ok, mensagem: r.mensagem };
    });
  }

  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" htmlFor="nome" className="sm:col-span-2">
            <Input id="nome" name="nome" defaultValue={valorCampo(estado, "nome", produto?.nome)} required className="h-11" />
            <ErroCampo estado={estado} campo="nome" />
          </Campo>
          <Campo rotulo="Descrição" htmlFor="descricao" className="sm:col-span-2">
            <Textarea id="descricao" name="descricao" defaultValue={valorCampo(estado, "descricao", produto?.descricao)} maxLength={500} rows={3} />
            <ErroCampo estado={estado} campo="descricao" />
          </Campo>
          <Campo rotulo="Preço (R$)" htmlFor="preco">
            <Input
              id="preco"
              name="preco"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={valorCampo(estado, "preco", produto ? textoDeCentavos(produto.preco) : "")}
              required
              className="h-11"
            />
            <ErroCampo estado={estado} campo="preco" />
          </Campo>
          <Campo rotulo="Categoria" htmlFor="categoria_id">
            <Selecao
              key={`${estado?.chave ?? ""}-${listaCategorias.length}`}
              id="categoria_id"
              name="categoria_id"
              defaultValue={categoriaNova ?? valorCampo(estado, "categoria_id", produto?.categoria_id ?? categoriaInicial)}
              required
              className="h-11"
            >
              <option value="" disabled>
                Escolha...
              </option>
              {listaCategorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
            <ErroCampo estado={estado} campo="categoria_id" />
            {/* Sem sair da tela: antes o primeiro produto mandava criar a categoria em outra página. */}
            {criandoCategoria ? (
              <div className="flex gap-2">
                <Input
                  value={nomeCategoria}
                  onChange={(e) => setNomeCategoria(e.target.value)}
                  placeholder="Ex.: Espetos"
                  maxLength={80}
                  className="h-11"
                  aria-label="Nome da nova categoria"
                  autoFocus
                />
                <Button type="button" className="h-11" disabled={nomeCategoria.trim().length < 2} onClick={criarCategoria}>
                  Criar
                </Button>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setCriandoCategoria(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setCriandoCategoria(true)}>
                <Plus />
                Nova categoria
              </Button>
            )}
          </Campo>
          <div className="sm:col-span-2">
            <UploadImagem
              bucket="rest-produtos"
              restauranteId={restauranteId}
              name="foto_url"
              valorInicial={estado?.valores?.foto_url ?? produto?.foto_url ?? null}
              rotulo="Foto"
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="disponivel"
              defaultChecked={marcadoCampo(estado, "disponivel", produto?.disponivel ?? true)}
              className="size-5 accent-[var(--cor-primaria-texto)]"
            />
            Disponível (desmarque quando esgotar: some do salão e do delivery)
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="disponivel_delivery"
              defaultChecked={marcadoCampo(estado, "disponivel_delivery", produto?.disponivel_delivery ?? true)}
              className="size-5 accent-[var(--cor-primaria-texto)]"
            />
            Também vende no delivery
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Preparo na cozinha</h2>
            <Link href="/painel/pracas" className="text-sm underline underline-offset-4">
              Gerenciar praças
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Por quais praças o produto passa. Ex.: espeto só na churrasqueira; picanha na churrasqueira e depois na cozinha.
          </p>
          <input type="hidden" name="etapas" value={JSON.stringify(etapasParaBanco(etapas))} />
          <EditorRota pracas={pracas} etapas={etapas} aoMudar={setEtapas} />
          <ErroCampo estado={estado} campo="etapas" />
          <label className="mt-2 flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="para_viagem"
              defaultChecked={marcadoCampo(estado, "para_viagem", produto?.para_viagem ?? false)}
              className="mt-0.5 size-5 accent-[var(--cor-primaria-texto)]"
            />
            <span>
              Sempre sai pra viagem
              <span className="block font-normal text-muted-foreground">
                Ex.: marmita ou açaí no copo. O garçom ainda pode mudar na hora; delivery é sempre pra viagem.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Adicionais e opções</h2>
            <Link href="/painel/adicionais" className="text-sm underline underline-offset-4">
              Gerenciar grupos
            </Link>
          </div>
          <input type="hidden" name="grupos" value={JSON.stringify(gruposEscolhidos)} />
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum grupo cadastrado. Crie em{" "}
              <Link href="/painel/adicionais" className="underline underline-offset-4">
                Adicionais
              </Link>{" "}
              (ex.: ponto da carne, adicionais com preço) e volte aqui para ligar ao produto.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {grupos.map((g) => {
                const marcado = gruposEscolhidos.includes(g.id);
                return (
                  <li key={g.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        marcado ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) =>
                          setGruposEscolhidos((atual) => (e.target.checked ? [...atual, g.id] : atual.filter((id) => id !== g.id)))
                        }
                        className="mt-0.5 size-5 accent-[var(--cor-primaria-texto)]"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">
                          {g.nome}
                          {!g.ativo ? <span className="ml-2 text-xs font-normal text-muted-foreground">(inativo)</span> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {g.minimo > 0 ? "Obrigatório · " : ""}
                          {regraDoGrupo(g)}
                        </span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {g.opcoes.length > 0 ? g.opcoes.join(", ") : "Sem opções"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {estado && !estado.ok && estado.mensagem ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.mensagem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <BotaoEnviar className="h-11">{produto ? "Salvar produto" : "Criar produto"}</BotaoEnviar>
        <Button variant="ghost" className="h-11" nativeButton={false} render={<Link href="/painel/produtos" />}>
          Cancelar
        </Button>
        {produto ? (
          <span className="ml-auto">
            <BotaoConfirmar
              rotulo="Excluir produto"
              icone={false}
              className="h-11 text-destructive"
              desabilitado={pendente}
              aoConfirmar={() => executar(() => excluirProduto(produto.id))}
            >
              Excluir produto
            </BotaoConfirmar>
          </span>
        ) : null}
      </div>
    </form>
  );
}
