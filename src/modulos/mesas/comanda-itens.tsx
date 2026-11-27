"use client";

import { Check, Undo2 } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Stepper } from "@/components/staff/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resumoAdicionais } from "@/lib/adicionais";
import { formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { alterarItem, cancelarItem, entregarItem } from "./actions";
import type { ItemComanda } from "./dados";

// Itens da comanda: cada lançamento como saiu (com hora, quem lançou e o andamento do preparo)
// e a visão "tudo junto", somada por produto. Saiu de tela-comanda.tsx, que tinha mil linhas.

const MOTIVOS = ["Lançado errado", "Cliente desistiu", "Produto em falta", "Demorou demais"];

export function LinhaItem({ item, editavel }: { item: ItemComanda; editavel: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const [observacao, setObservacao] = useState(item.observacao ?? "");
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { pendente, executar } = useAcao();

  if (item.cancelado) {
    return (
      <li className="flex flex-col gap-0.5 py-3 text-muted-foreground">
        <div className="flex justify-between gap-2 line-through">
          <span>
            {item.quantidade}× {item.nome}
            {item.adicionais.length > 0 ? ` (${resumoAdicionais(item.adicionais)})` : ""}
          </span>
          <span>{formatarBRL(item.total)}</span>
        </div>
        <span className="text-xs">Cancelado: {item.motivoCancelamento}</span>
      </li>
    );
  }

  return (
    <li className="py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-md py-2 text-left disabled:cursor-default"
          aria-expanded={aberto}
          disabled={!editavel}
          onClick={() => setAberto((a) => !a)}
        >
          <span className="flex flex-col">
            <span className="font-medium">
              {item.quantidade}× {item.nome}
            </span>
            {item.adicionais.length > 0 ? (
              <span className="text-sm text-muted-foreground">{resumoAdicionais(item.adicionais)}</span>
            ) : null}
            {item.paraViagem ? <span className="text-xs font-bold text-violet-700 uppercase">Pra viagem</span> : null}
            {item.pagos > 0 ? (
              <span className="mt-0.5 w-fit rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">
                {item.pagos >= item.quantidade ? "Pago" : `${item.pagos} de ${item.quantidade} pago`}
              </span>
            ) : null}
            {item.entregue ? (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                <Check className="size-3.5" aria-hidden />
                Entregue
              </span>
            ) : item.preparo === "pronto" || (item.quandoLevar === "com_a_comida" && item.preparo === "entregue") ? (
              <span className="mt-0.5 w-fit rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">Pronto · levar</span>
            ) : item.quandoLevar === "com_a_comida" ? (
              <span className="text-xs font-medium text-muted-foreground">Levar com a comida</span>
            ) : item.preparo === "na_cozinha" ? (
              <span className="text-xs font-medium text-muted-foreground">Na cozinha</span>
            ) : item.quandoLevar === "agora" ? (
              <span className="mt-0.5 w-fit rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950">Levar agora</span>
            ) : null}
            {item.observacao ? <span className="text-sm text-muted-foreground">Obs.: {item.observacao}</span> : null}
          </span>
          <span className="font-medium tabular-nums">{formatarBRL(item.total)}</span>
        </button>
        {/* Cada item vai à mesa quando fica pronto (o refri agora, o lanche depois). */}
        {editavel && !item.entregue ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("shrink-0", item.preparo === "pronto" && "border-green-600 text-green-800 hover:bg-green-50")}
            disabled={pendente}
            aria-label={`Entreguei ${item.nome}`}
            onClick={() => executar(() => entregarItem(item.id, true))}
          >
            <Check />
            Entreguei
          </Button>
        ) : null}
      </div>

      {aberto ? (
        <div className="mb-2 flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
          {!cancelando ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Quantidade</span>
                <Stepper valor={quantidade} aoMudar={setQuantidade} rotulo={`quantidade de ${item.nome}`} />
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Observação
                <Input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={300}
                  placeholder="Ex.: sem cebola"
                  className="h-11 bg-background"
                />
              </label>
              {item.entregue ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-fit"
                  disabled={pendente}
                  onClick={() => executar(() => entregarItem(item.id, false), () => setAberto(false))}
                >
                  <Undo2 />
                  Ainda não foi entregue
                </Button>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-11 flex-1"
                  disabled={pendente || (quantidade === item.quantidade && observacao === (item.observacao ?? ""))}
                  onClick={() => executar(() => alterarItem(item.id, quantidade, observacao), () => setAberto(false))}
                >
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 text-destructive"
                  onClick={() => setCancelando(true)}
                >
                  Cancelar item
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm font-medium">Motivo do cancelamento</span>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={motivo === m ? "default" : "outline"}
                    className="h-10"
                    onClick={() => setMotivo(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
              <Input
                value={MOTIVOS.includes(motivo) ? "" : motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ou escreva o motivo"
                maxLength={500}
                className="h-11 bg-background"
                aria-label="Outro motivo"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 flex-1"
                  disabled={pendente || motivo.trim().length < 3}
                  onClick={() => executar(() => cancelarItem(item.id, motivo))}
                >
                  Confirmar cancelamento
                </Button>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setCancelando(false)}>
                  Voltar
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

// Histórico da mesa: um grupo por pedido (cada lançamento do garçom), na ordem em que saíram.
export function agruparPorPedido(itens: ItemComanda[]) {
  const grupos = new Map<number, { pedidoId: string; numero: number; criadoEm: string; autor: string | null; total: number; itens: ItemComanda[] }>();
  for (const i of itens) {
    const g = grupos.get(i.pedidoNumero) ?? { pedidoId: i.pedidoId, numero: i.pedidoNumero, criadoEm: i.pedidoCriadoEm, autor: i.pedidoAutor, total: 0, itens: [] };
    g.itens.push(i);
    if (!i.cancelado) g.total += i.total;
    grupos.set(i.pedidoNumero, g);
  }
  return [...grupos.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

// Tudo junto: o mesmo produto (com as mesmas opções e observação) somado num item só.
export function ResumoItens({ itens }: { itens: ItemComanda[] }) {
  const somados = new Map<string, { nome: string; detalhe: string; quantidade: number; total: number }>();
  for (const i of itens.filter((x) => !x.cancelado)) {
    const detalhe = [resumoAdicionais(i.adicionais), i.observacao ? `Obs.: ${i.observacao}` : ""].filter(Boolean).join(" · ");
    const chave = `${i.nome}|${detalhe}|${i.precoUnitario}`;
    const atual = somados.get(chave) ?? { nome: i.nome, detalhe, quantidade: 0, total: 0 };
    atual.quantidade += i.quantidade;
    atual.total += i.total;
    somados.set(chave, atual);
  }
  return (
    <ul className="divide-y">
      {[...somados.entries()].map(([chave, i]) => (
        <li key={chave} className="flex justify-between gap-3 py-2">
          <span className="flex flex-col">
            <span className="font-medium">
              {i.quantidade}× {i.nome}
            </span>
            {i.detalhe ? <span className="text-sm text-muted-foreground">{i.detalhe}</span> : null}
          </span>
          <span className="font-medium tabular-nums">{formatarBRL(i.total)}</span>
        </li>
      ))}
    </ul>
  );
}
