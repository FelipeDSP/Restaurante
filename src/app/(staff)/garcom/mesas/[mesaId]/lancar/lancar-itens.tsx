"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ListPlus, MessageSquarePlus, Minus, Plus, Search, Send, ShoppingBag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { EscolherOpcoes } from "@/components/adicionais/escolher-opcoes";
import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AdicionalEscolhido, chaveDaEscolha, precoDasOpcoes, regraDoGrupo, resumoAdicionais } from "@/lib/adicionais";
import { formatarBRL } from "@/lib/dinheiro";
import { useRascunho } from "@/lib/rascunho";
import { cn } from "@/lib/utils";

import { lancarItens } from "../../../actions";
import type { CategoriaCardapio, ProdutoCardapio } from "../../../dados";

// Uma linha do lançamento: produto + opções escolhidas. Produto sem opções tem uma linha só.
type Linha = { produtoId: string; adicionais: AdicionalEscolhido[]; quantidade: number; observacao: string; paraViagem: boolean };

const SEM_LINHAS: Record<string, Linha> = {};

// Rascunho por mesa, lembrando para qual comanda foi montado: se a comanda for fechada por
// outra pessoa, os itens não se perdem nem vão sozinhos para a comanda do próximo cliente.
type Rascunho = { comandaId: string; linhas: Record<string, Linha> };
const SEM_RASCUNHO: Rascunho = { comandaId: "", linhas: SEM_LINHAS };

function BotaoViagem({ ativo, aoMudar, rotulo }: { ativo: boolean; aoMudar: () => void; rotulo: string }) {
  return (
    <Button
      type="button"
      variant={ativo ? "default" : "ghost"}
      size="sm"
      aria-pressed={ativo}
      aria-label={`Pra viagem: ${rotulo}`}
      onClick={aoMudar}
    >
      <ShoppingBag />
      Pra viagem
    </Button>
  );
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function Contador({
  rotulo,
  quantidade,
  aoMudar,
}: {
  rotulo: string;
  quantidade: number;
  aoMudar: (quantidade: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={`Diminuir ${rotulo}`}
        onClick={() => aoMudar(quantidade - 1)}
      >
        {quantidade === 1 ? <Trash2 /> : <Minus />}
      </Button>
      <span className="w-7 text-center text-lg font-bold tabular-nums" aria-live="polite">
        {quantidade}
      </span>
      <Button
        type="button"
        size="icon"
        className="size-11"
        aria-label={`Aumentar ${rotulo}`}
        onClick={() => aoMudar(Math.min(99, quantidade + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}

function LinhaProdutoSimples({
  produto,
  linha,
  aoMudar,
}: {
  produto: ProdutoCardapio;
  linha: Linha | undefined;
  aoMudar: (linha: Linha | undefined) => void;
}) {
  const [mostrarObs, setMostrarObs] = useState(Boolean(linha?.observacao));
  const quantidade = linha?.quantidade ?? 0;
  const viagem = linha?.paraViagem ?? produto.paraViagem;
  const mudar = (qtd: number, observacao = linha?.observacao ?? "", paraViagem = viagem) =>
    aoMudar(qtd > 0 ? { produtoId: produto.id, adicionais: [], quantidade: qtd, observacao, paraViagem } : undefined);

  return (
    <li className={cn("rounded-xl border p-3 transition-colors", quantidade > 0 && "border-[var(--cor-primaria)] bg-[var(--cor-primaria)]/5")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-h-12 flex-1 flex-col items-start text-left"
          onClick={() => mudar(Math.min(99, quantidade + 1))}
          aria-label={`Adicionar ${produto.nome}`}
        >
          <span className="font-medium">{produto.nome}</span>
          <span className="text-sm text-muted-foreground">{formatarBRL(produto.preco)}</span>
        </button>
        {quantidade > 0 ? (
          <Contador rotulo={produto.nome} quantidade={quantidade} aoMudar={(q) => mudar(q)} />
        ) : (
          <Button type="button" size="icon" className="size-11" aria-label={`Adicionar ${produto.nome}`} onClick={() => mudar(1)}>
            <Plus />
          </Button>
        )}
      </div>
      {quantidade > 0 ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {mostrarObs ? (
            <Input
              value={linha?.observacao ?? ""}
              onChange={(e) => mudar(quantidade, e.target.value)}
              placeholder="Observação (ex.: sem cebola, ao ponto)"
              maxLength={300}
              className="h-11 min-w-48 flex-1"
              aria-label={`Observação de ${produto.nome}`}
              autoFocus
            />
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMostrarObs(true)}>
              <MessageSquarePlus />
              Observação
            </Button>
          )}
          <BotaoViagem ativo={viagem} rotulo={produto.nome} aoMudar={() => mudar(quantidade, linha?.observacao ?? "", !viagem)} />
        </div>
      ) : null}
    </li>
  );
}

// Produto com opções: cada escolha vira uma linha própria, listada abaixo do produto.
function LinhaProdutoComOpcoes({
  produto,
  linhas,
  aoEscolher,
  aoMudarQuantidade,
}: {
  produto: ProdutoCardapio;
  linhas: [string, Linha][];
  aoEscolher: () => void;
  aoMudarQuantidade: (chave: string, quantidade: number) => void;
}) {
  const obrigatorios = produto.grupos.filter((g) => g.minimo > 0).map((g) => g.nome);
  return (
    <li className={cn("rounded-xl border p-3 transition-colors", linhas.length > 0 && "border-[var(--cor-primaria)] bg-[var(--cor-primaria)]/5")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-h-12 flex-1 flex-col items-start text-left"
          onClick={aoEscolher}
          aria-label={`Escolher opções de ${produto.nome}`}
        >
          <span className="font-medium">{produto.nome}</span>
          <span className="text-sm text-muted-foreground">
            {formatarBRL(produto.preco)}
            {obrigatorios.length > 0 ? ` · escolher ${obrigatorios.join(", ").toLowerCase()}` : ` · ${regraDoGrupo(produto.grupos[0]).toLowerCase()}`}
          </span>
        </button>
        <Button type="button" size="icon" className="size-11" aria-label={`Escolher opções de ${produto.nome}`} onClick={aoEscolher}>
          <ListPlus />
        </Button>
      </div>
      {linhas.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2 border-t pt-2">
          {linhas.map(([chave, linha]) => (
            <li key={chave} className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span className="font-medium">
                  {resumoAdicionais(linha.adicionais) || "Sem opções"}
                  {linha.paraViagem ? <span className="ml-2 text-xs font-bold text-violet-700 uppercase">Pra viagem</span> : null}
                </span>
                {linha.observacao ? <span className="text-muted-foreground">Obs.: {linha.observacao}</span> : null}
                <span className="text-muted-foreground tabular-nums">
                  {formatarBRL((produto.preco + precoDasOpcoes(linha.adicionais)) * linha.quantidade)}
                </span>
              </span>
              <Contador rotulo={`${produto.nome} ${resumoAdicionais(linha.adicionais)}`} quantidade={linha.quantidade} aoMudar={(q) => aoMudarQuantidade(chave, q)} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function LancarItens({
  mesaId,
  comandaId,
  destino,
  cardapio,
}: {
  mesaId: string;
  comandaId: string;
  // Para onde ir depois de enviar (comanda no app do garçom ou no painel).
  destino: string;
  cardapio: CategoriaCardapio[];
}) {
  const router = useRouter();
  const [categoriaAtiva, setCategoriaAtiva] = useState(cardapio[0]?.id ?? "");
  const [busca, setBusca] = useState("");
  const [escolhendo, setEscolhendo] = useState<ProdutoCardapio | null>(null);
  const [revisando, setRevisando] = useState(false);
  // O portal da revisão fica dentro da tela do restaurante para herdar as cores da marca.
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);
  const { pendente, executar } = useAcao();

  const produtosPorId = useMemo(
    () => new Map(cardapio.flatMap((c) => c.produtos.map((p) => [p.id, p] as const))),
    [cardapio],
  );

  // O pedido montado fica na aba: queda de rede ou "Tentar de novo" não apagam.
  // Só voltam linhas de produtos que ainda estão no cardápio.
  const normalizarRascunho = useCallback(
    (valor: unknown): Rascunho | null => {
      if (!valor || typeof valor !== "object") return null;
      const r = valor as Partial<Rascunho>;
      if (typeof r.comandaId !== "string" || !r.linhas || typeof r.linhas !== "object") return null;
      const linhas = Object.fromEntries(
        Object.entries(r.linhas).filter(
          ([, l]) => l && produtosPorId.has(l.produtoId) && Number.isInteger(l.quantidade) && l.quantidade > 0 && Array.isArray(l.adicionais),
        ),
      );
      return { comandaId: r.comandaId, linhas };
    },
    [produtosPorId],
  );
  const [rascunho, setRascunho, limparLinhas] = useRascunho(`lancamento:${mesaId}`, SEM_RASCUNHO, normalizarRascunho, "sessao");
  const linhas = rascunho.comandaId === comandaId ? rascunho.linhas : SEM_LINHAS;
  const deOutraComanda = rascunho.comandaId !== comandaId ? Object.values(rascunho.linhas) : [];
  const setLinhas = (mudar: (atual: Record<string, Linha>) => Record<string, Linha>) =>
    setRascunho((r) => ({ comandaId, linhas: mudar(r.comandaId === comandaId ? r.linhas : SEM_LINHAS) }));

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (termo) {
      return cardapio.flatMap((c) => c.produtos).filter((p) => normalizar(p.nome).includes(termo));
    }
    return cardapio.find((c) => c.id === categoriaAtiva)?.produtos ?? [];
  }, [busca, cardapio, categoriaAtiva]);

  const selecionadas = Object.entries(linhas);
  const totalItens = selecionadas.reduce((soma, [, l]) => soma + l.quantidade, 0);
  const totalValor = selecionadas.reduce(
    (soma, [, l]) => soma + ((produtosPorId.get(l.produtoId)?.preco ?? 0) + precoDasOpcoes(l.adicionais)) * l.quantidade,
    0,
  );

  function definirLinha(chave: string, linha: Linha | undefined) {
    setLinhas((atual) => {
      const proximo = { ...atual };
      if (linha) proximo[chave] = linha;
      else delete proximo[chave];
      return proximo;
    });
  }

  function mudarQuantidade(chave: string, quantidade: number) {
    setLinhas((atual) => {
      const proximo = { ...atual };
      if (quantidade <= 0) delete proximo[chave];
      else if (proximo[chave]) proximo[chave] = { ...proximo[chave], quantidade };
      return proximo;
    });
  }

  // Mesmo conteúdo = mesmo lote: reenviar depois de uma falha de rede não lança em dobro.
  const envioAtual = useRef<{ conteudo: string; lote: string } | null>(null);

  function enviar() {
    const itens = selecionadas.map(([, l]) => ({
      produtoId: l.produtoId,
      quantidade: l.quantidade,
      observacao: l.observacao.trim() || null,
      adicionais: l.adicionais.map((a) => a.id),
      paraViagem: l.paraViagem,
    }));
    const conteudo = JSON.stringify([comandaId, itens]);
    if (envioAtual.current?.conteudo !== conteudo) envioAtual.current = { conteudo, lote: crypto.randomUUID() };
    const lote = envioAtual.current.lote;
    executar(
      async () => {
        const resultado = await lancarItens(comandaId, itens, { lote, totalEsperado: totalValor });
        // Preço ou disponibilidade mudou: recarrega o cardápio com os valores de agora.
        if (!resultado?.ok) router.refresh();
        return resultado;
      },
      () => {
        limparLinhas();
        router.push(destino);
      },
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-28">
      {deOutraComanda.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">
            Itens montados para a comanda anterior desta mesa (fechada por outra pessoa):{" "}
            {deOutraComanda.map((l) => `${l.quantidade}× ${produtosPorId.get(l.produtoId)?.nome ?? ""}`).join(", ")}.
          </p>
          <div className="flex gap-2">
            <Button type="button" className="h-11 flex-1" onClick={() => setRascunho((r) => ({ ...r, comandaId }))}>
              Usar nesta comanda
            </Button>
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={limparLinhas}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto"
          className="h-11 pl-9"
          aria-label="Buscar produto"
          type="search"
        />
      </div>

      {!busca ? (
        <div role="tablist" aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto sem-barra-rolagem px-4 pb-1">
          {cardapio.map((c) => {
            const ids = new Set(c.produtos.map((p) => p.id));
            const naCategoria = selecionadas.reduce((soma, [, l]) => soma + (ids.has(l.produtoId) ? l.quantidade : 0), 0);
            return (
              <Button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === categoriaAtiva}
                variant={c.id === categoriaAtiva ? "default" : "outline"}
                className="h-11 shrink-0 rounded-full px-4"
                onClick={() => setCategoriaAtiva(c.id)}
              >
                {c.nome}
                {naCategoria > 0 ? <span className="ml-1 rounded-full bg-background/30 px-1.5 text-xs">{naCategoria}</span> : null}
              </Button>
            );
          })}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {visiveis.map((produto) =>
          produto.grupos.length > 0 ? (
            <LinhaProdutoComOpcoes
              key={produto.id}
              produto={produto}
              linhas={selecionadas.filter(([, l]) => l.produtoId === produto.id)}
              aoEscolher={() => setEscolhendo(produto)}
              aoMudarQuantidade={mudarQuantidade}
            />
          ) : (
            <LinhaProdutoSimples
              key={produto.id}
              produto={produto}
              linha={linhas[chaveDaEscolha(produto.id, [])]}
              aoMudar={(linha) => definirLinha(chaveDaEscolha(produto.id, []), linha)}
            />
          ),
        )}
        {visiveis.length === 0 ? <li className="py-6 text-center text-muted-foreground">Nenhum produto encontrado.</li> : null}
      </ul>

      <EscolherOpcoes
        produto={escolhendo}
        aoFechar={() => setEscolhendo(null)}
        rotuloConfirmar="Adicionar ao pedido"
        viagemPadrao={escolhendo?.paraViagem ?? false}
        aoConfirmar={(escolha) => {
          if (!escolhendo) return;
          const chave =
            chaveDaEscolha(escolhendo.id, escolha.adicionais.map((a) => a.id), escolha.observacao) + (escolha.paraViagem ? "|viagem" : "");
          const existente = linhas[chave];
          definirLinha(chave, {
            produtoId: escolhendo.id,
            adicionais: escolha.adicionais,
            observacao: escolha.observacao,
            paraViagem: escolha.paraViagem,
            quantidade: Math.min(99, (existente?.quantidade ?? 0) + escolha.quantidade),
          });
          setEscolhendo(null);
        }}
      />

      {/* Revisão: tudo o que vai ser enviado num lugar só (antes os itens ficavam espalhados por categoria). */}
      <Dialog.Root open={revisando} onOpenChange={setRevisando}>
        <span ref={setAncora} hidden />
        <Dialog.Portal container={ancora?.parentElement ?? undefined}>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl bg-background shadow-xl outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full sm:mx-auto sm:max-w-md">
            <div className="flex items-center justify-between border-b p-4">
              <Dialog.Title className="text-lg font-bold">Revisar pedido</Dialog.Title>
              <Dialog.Close aria-label="Fechar" className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <ul className="flex flex-1 flex-col divide-y overflow-y-auto px-4">
              {selecionadas.map(([chave, linha]) => {
                const produto = produtosPorId.get(linha.produtoId);
                return (
                  <li key={chave} className="flex items-center gap-3 py-3">
                    <span className="flex min-w-0 flex-1 flex-col text-sm">
                      <span className="font-medium">{produto?.nome}</span>
                      {linha.adicionais.length > 0 ? <span className="text-muted-foreground">{resumoAdicionais(linha.adicionais)}</span> : null}
                      {linha.observacao ? <span className="text-muted-foreground">Obs.: {linha.observacao}</span> : null}
                      {linha.paraViagem ? <span className="text-xs font-bold text-violet-700 uppercase">Pra viagem</span> : null}
                      <span className="tabular-nums text-muted-foreground">
                        {formatarBRL(((produto?.preco ?? 0) + precoDasOpcoes(linha.adicionais)) * linha.quantidade)}
                      </span>
                    </span>
                    <Contador rotulo={produto?.nome ?? ""} quantidade={linha.quantidade} aoMudar={(q) => mudarQuantidade(chave, q)} />
                  </li>
                );
              })}
              {selecionadas.length === 0 ? <li className="py-6 text-center text-muted-foreground">Nenhum item escolhido.</li> : null}
            </ul>
            <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                className="h-14 w-full justify-between text-base"
                disabled={totalItens === 0 || pendente}
                onClick={() => {
                  setRevisando(false);
                  enviar();
                }}
              >
                <span className="flex items-center gap-2">
                  <Send />
                  Enviar {totalItens} {totalItens === 1 ? "item" : "itens"}
                </span>
                <span className="tabular-nums">{formatarBRL(totalValor)}</span>
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-14 shrink-0 px-4 text-base"
            disabled={totalItens === 0}
            onClick={() => setRevisando(true)}
          >
            Revisar
          </Button>
          <Button
            type="button"
            className="h-14 min-w-0 flex-1 justify-between text-base"
            disabled={totalItens === 0 || pendente}
            onClick={enviar}
          >
            <span className="flex items-center gap-2">
              <Send />
              {pendente ? "Enviando..." : totalItens === 0 ? "Escolha os itens" : `Enviar ${totalItens} ${totalItens === 1 ? "item" : "itens"}`}
            </span>
            <span className="tabular-nums">{formatarBRL(totalValor)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
