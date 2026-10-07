"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, Minus, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type AdicionalEscolhido,
  type GrupoAdicionais,
  precoDasOpcoes,
  regraDoGrupo,
  validarEscolha,
} from "@/lib/adicionais";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

export type ProdutoComOpcoes = {
  id: string;
  nome: string;
  preco: number;
  descricao?: string | null;
  fotoUrl?: string | null;
  grupos: GrupoAdicionais[];
};

export type EscolhaFeita = { adicionais: AdicionalEscolhido[]; quantidade: number; observacao: string; paraViagem: boolean };

// Folha (celular) / janela (tela grande) para escolher as opções de um produto.
// Usada no site de delivery e no lançamento do garçom; cores vêm da marca do restaurante.
export function EscolherOpcoes({
  produto,
  aoFechar,
  aoConfirmar,
  rotuloConfirmar = "Adicionar",
  viagemPadrao,
}: {
  produto: ProdutoComOpcoes | null;
  aoFechar: () => void;
  aoConfirmar: (escolha: EscolhaFeita) => void;
  rotuloConfirmar?: string;
  // Só no salão: mostra o "pra viagem" já marcado com o padrão do produto.
  viagemPadrao?: boolean;
}) {
  // O portal fica dentro da tela do restaurante (e não no <body>) para herdar as cores da marca.
  const [ancora, setAncora] = useState<HTMLSpanElement | null>(null);

  return (
    <Dialog.Root open={produto !== null} onOpenChange={(aberto) => (aberto ? null : aoFechar())}>
      <span ref={setAncora} hidden />
      <Dialog.Portal container={ancora?.parentElement ?? undefined}>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl outline-none transition-transform duration-200",
            "data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[ending-style]:translate-y-[-45%] sm:data-[ending-style]:opacity-0 sm:data-[starting-style]:translate-y-[-45%] sm:data-[starting-style]:opacity-0",
          )}
        >
          {/* Remonta a cada produto: começa sempre sem nada escolhido. */}
          {produto ? (
            <Conteudo
              key={produto.id}
              produto={produto}
              aoConfirmar={aoConfirmar}
              rotuloConfirmar={rotuloConfirmar}
              viagemPadrao={viagemPadrao}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Conteudo({
  produto,
  aoConfirmar,
  rotuloConfirmar,
  viagemPadrao,
}: {
  produto: ProdutoComOpcoes;
  aoConfirmar: (escolha: EscolhaFeita) => void;
  rotuloConfirmar: string;
  viagemPadrao?: boolean;
}) {
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [tentou, setTentou] = useState(false);
  const [paraViagem, setParaViagem] = useState(viagemPadrao ?? false);

  const opcoes = produto.grupos.flatMap((g) => g.opcoes.map((o) => ({ ...o, grupo: g.nome })));
  const selecionadas = opcoes.filter((o) => escolhidos.includes(o.id));
  const erro = validarEscolha(produto.grupos, escolhidos);
  const total = (produto.preco + precoDasOpcoes(selecionadas)) * quantidade;

  function alternar(grupo: GrupoAdicionais, opcaoId: string) {
    setEscolhidos((atual) => {
      const doGrupo = grupo.opcoes.map((o) => o.id);
      const marcada = atual.includes(opcaoId);
      if (marcada) return grupo.maximo === 1 && grupo.minimo === 1 ? atual : atual.filter((id) => id !== opcaoId);
      // Escolha única: troca a opção do grupo.
      if (grupo.maximo === 1) return [...atual.filter((id) => !doGrupo.includes(id)), opcaoId];
      const noGrupo = atual.filter((id) => doGrupo.includes(id)).length;
      return noGrupo >= grupo.maximo ? atual : [...atual, opcaoId];
    });
  }

  function confirmar() {
    setTentou(true);
    if (erro) return;
    aoConfirmar({
      adicionais: selecionadas.map((o) => ({ id: o.id, grupo: o.grupo, nome: o.nome, preco: o.preco })),
      quantidade,
      observacao: observacao.trim(),
      paraViagem,
    });
  }

  return (
    <>
      <div className="flex items-start gap-3 border-b p-4">
        {produto.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto do Storage do restaurante
          <img src={produto.fotoUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Dialog.Title className="text-lg font-bold">{produto.nome}</Dialog.Title>
          {produto.descricao ? (
            <Dialog.Description className="line-clamp-2 text-sm text-muted-foreground">{produto.descricao}</Dialog.Description>
          ) : null}
          <span className="text-sm font-semibold tabular-nums">{formatarBRL(produto.preco)}</span>
        </div>
        <Dialog.Close
          aria-label="Fechar"
          className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-5" />
        </Dialog.Close>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto p-4">
        {produto.grupos.map((grupo) => {
          const noGrupo = grupo.opcoes.filter((o) => escolhidos.includes(o.id)).length;
          const unica = grupo.maximo === 1 && grupo.minimo === 1;
          const faltando = tentou && noGrupo < grupo.minimo;
          return (
            <fieldset key={grupo.id} className="flex flex-col gap-2">
              <legend className="mb-2 flex w-full items-center justify-between gap-2">
                <span className="font-semibold">{grupo.nome}</span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    faltando
                      ? "bg-destructive/10 text-destructive"
                      : grupo.minimo > 0
                        ? noGrupo >= grupo.minimo
                          ? "bg-green-100 text-green-800"
                          : "bg-foreground text-background"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {grupo.minimo > 0 && noGrupo >= grupo.minimo ? (
                    <span className="flex items-center gap-1">
                      <Check className="size-3" strokeWidth={3} aria-hidden /> {regraDoGrupo(grupo)}
                    </span>
                  ) : grupo.minimo > 0 ? (
                    `Obrigatório · ${regraDoGrupo(grupo)}`
                  ) : (
                    regraDoGrupo(grupo)
                  )}
                </span>
              </legend>
              {grupo.opcoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma opção disponível agora.</p>
              ) : (
                grupo.opcoes.map((opcao) => {
                  const marcada = escolhidos.includes(opcao.id);
                  const bloqueada = !marcada && grupo.maximo > 1 && noGrupo >= grupo.maximo;
                  return (
                    <label
                      key={opcao.id}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                        marcada ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                        bloqueada && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type={unica ? "radio" : "checkbox"}
                        name={`grupo-${grupo.id}`}
                        checked={marcada}
                        disabled={bloqueada}
                        onChange={() => alternar(grupo, opcao.id)}
                        className="size-5 shrink-0 accent-[var(--cor-primaria-texto)]"
                      />
                      <span className="min-w-0 flex-1 font-medium break-words">{opcao.nome}</span>
                      {opcao.preco > 0 ? (
                        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">+ {formatarBRL(opcao.preco)}</span>
                      ) : null}
                    </label>
                  );
                })
              )}
            </fieldset>
          );
        })}

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Observação
          <Input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={300}
            placeholder="Ex.: sem cebola"
            className="h-11 font-normal"
          />
        </label>
        {viagemPadrao !== undefined ? (
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <input
              type="checkbox"
              checked={paraViagem}
              onChange={(e) => setParaViagem(e.target.checked)}
              className="size-5 accent-[var(--cor-primaria-texto)]"
            />
            <span className="font-medium">Pra viagem</span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {tentou && erro ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        ) : null}
        {/* Total numa linha própria: dentro do botão ele empurrava o botão para fora da tela em 360–390 px. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums">{formatarBRL(total)}</span>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-full"
              aria-label="Diminuir quantidade"
              disabled={quantidade <= 1}
              onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
            >
              <Minus />
            </Button>
            <span className="w-7 text-center text-lg font-bold tabular-nums" aria-live="polite">
              {quantidade}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-full"
              aria-label="Aumentar quantidade"
              disabled={quantidade >= 99}
              onClick={() => setQuantidade((q) => Math.min(99, q + 1))}
            >
              <Plus />
            </Button>
          </div>
          <Button type="button" className="h-12 min-w-0 flex-1 px-4 text-base" onClick={confirmar}>
            <span className="whitespace-normal leading-tight">{rotuloConfirmar}</span>
          </Button>
        </div>
      </div>
    </>
  );
}
