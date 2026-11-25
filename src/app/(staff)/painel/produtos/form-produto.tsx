"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { EscolherDias } from "@/components/staff/escolher-dias";
import { BotaoEnviar, Campo, ErroCampo, marcadoCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { UploadImagem } from "@/components/staff/upload-imagem";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { regraDoGrupo } from "@/lib/adicionais";
import { rotuloDias, rotuloJanela } from "@/lib/cardapios";
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
  dias: number[] | null;
};

export type GrupoParaProduto = { id: string; nome: string; minimo: number; maximo: number; ativo: boolean; opcoes: string[] };
export type CardapioParaProduto = { id: string; nome: string; dias: number[]; abre: string; fecha: string; ativo: boolean };

type Props = {
  restauranteId: string;
  categorias: { id: string; nome: string }[];
  produto?: ProdutoEditavel;
  categoriaInicial?: string;
  grupos: GrupoParaProduto[];
  gruposDoProduto?: string[];
  pracas: { id: string; nome: string }[];
  etapasDoProduto?: { estacao_id: string; ordem: number }[];
  cardapios: CardapioParaProduto[];
  cardapiosDoProduto?: string[];
  // Estoque simples deste produto (null quando a pessoa não cuida de estoque ou o produto é por ingrediente).
  estoque?: { saldo: string; unidade: string; controla: boolean } | null;
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
  cardapios,
  cardapiosDoProduto = [],
  estoque = null,
}: Props) {
  const [estado, acao] = useActionState(salvarProduto.bind(null, produto?.id ?? null), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  // Fora do <form>: sobrevive à remontagem após erro (o React 19 reseta o formulário).
  const [gruposEscolhidos, setGruposEscolhidos] = useState<string[]>(gruposDoProduto);
  const [etapas, setEtapas] = useState<EtapaEditavel[]>(() => etapasDoBanco(etapasDoProduto));
  const [cardapiosEscolhidos, setCardapiosEscolhidos] = useState<string[]>(cardapiosDoProduto);
  // null = todos os dias (o normal); lista = prato do dia que só aparece em certos dias.
  const [dias, setDias] = useState<number[] | null>(produto?.dias ?? null);
  const [controlaEstoque, setControlaEstoque] = useState(estoque?.controla ?? false);
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
              pasta={restauranteId}
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
            Disponível
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="disponivel_delivery"
              defaultChecked={marcadoCampo(estado, "disponivel_delivery", produto?.disponivel_delivery ?? true)}
              className="size-5 accent-[var(--cor-primaria-texto)]"
            />
            Aparece no delivery
          </label>
          {/* Estoque do jeito simples: digita quanto tem e pronto. Some para quem controla este
              produto por ingrediente (aí é na tela de Estoque). */}
          {estoque ? (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  name="controla_estoque"
                  checked={controlaEstoque}
                  onChange={(e) => setControlaEstoque(e.target.checked)}
                  className="size-5 accent-[var(--cor-primaria-texto)]"
                />
                Controlar estoque deste produto
              </label>
              {controlaEstoque ? (
                <Campo rotulo="Quanto tem agora" htmlFor="estoque" dica="em branco = não mexe no que já está lá">
                  <div className="flex items-center gap-2">
                    <Input
                      id="estoque"
                      name="estoque"
                      inputMode="decimal"
                      placeholder="0"
                      defaultValue={valorCampo(estado, "estoque", estoque.saldo)}
                      className="h-11 w-32"
                    />
                    <span className="text-sm text-muted-foreground">{estoque.unidade}</span>
                  </div>
                  <ErroCampo estado={estado} campo="estoque" />
                  {produto ? (
                    <Link href="/painel/estoque" className="text-sm text-muted-foreground underline underline-offset-4">
                      Controlar por ingredientes
                    </Link>
                  ) : null}
                </Campo>
              ) : null}
            </div>
          ) : null}
          {/* Dia da semana (prato do dia): fica escondido para quem não usa. */}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <input type="hidden" name="dias" value={dias ? JSON.stringify(dias) : ""} />
            {dias ? (
              <Campo rotulo="Aparece só nestes dias" htmlFor="dias-produto">
                <EscolherDias dias={dias} aoMudar={setDias} nome={null} mostrarTodos={false} />
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setDias(null)}>
                  Volta a aparecer todos os dias
                </Button>
              </Campo>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setDias([new Date().getDay()])}>
                Só em alguns dias da semana
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cardápios por horário: só aparece para quem cadastrou algum. */}
      {cardapios.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Em que horário aparece</h2>
              <Link href="/painel/cardapios" className="text-sm underline underline-offset-4">
                Editar cardápios
              </Link>
            </div>
            <input type="hidden" name="cardapios" value={JSON.stringify(cardapiosEscolhidos)} />
            <ul className="grid gap-2 sm:grid-cols-2">
              {cardapios.map((c) => {
                const marcado = cardapiosEscolhidos.includes(c.id);
                return (
                  <li key={c.id}>
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
                          setCardapiosEscolhidos((atual) =>
                            e.target.checked ? [...atual, c.id] : atual.filter((id) => id !== c.id),
                          )
                        }
                        className="mt-0.5 size-5 accent-[var(--cor-primaria-texto)]"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">
                          {c.nome}
                          {!c.ativo ? <span className="ml-2 text-xs font-normal text-muted-foreground">(desligado)</span> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {rotuloDias(c.dias)}, {rotuloJanela(c.abre, c.fecha)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {cardapiosEscolhidos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem marcar nenhum, aparece a qualquer hora.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Onde é preparado</h2>
            <Link href="/painel/pracas" className="text-sm underline underline-offset-4">
              Editar setores
            </Link>
          </div>
          <input type="hidden" name="etapas" value={JSON.stringify(etapasParaBanco(etapas))} />
          <EditorRota pracas={pracas} etapas={etapas} aoMudar={setEtapas} />
          <ErroCampo estado={estado} campo="etapas" />
          <label className="mt-2 flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="para_viagem"
              defaultChecked={marcadoCampo(estado, "para_viagem", produto?.para_viagem ?? false)}
              className="size-5 accent-[var(--cor-primaria-texto)]"
            />
            Sempre sai pra viagem
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Adicionais e opções</h2>
            <Link href="/painel/adicionais" className="text-sm underline underline-offset-4">
              Editar adicionais
            </Link>
          </div>
          <input type="hidden" name="grupos" value={JSON.stringify(gruposEscolhidos)} />
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum adicional cadastrado.</p>
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
