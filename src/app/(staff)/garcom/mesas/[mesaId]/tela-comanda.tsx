"use client";

import { Calculator, Check, Minus, Pencil, Plus, Printer, ReceiptText, Undo2, UtensilsCrossed, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resumoAdicionais } from "@/lib/adicionais";
import { centavosDeTexto, formatarBRL, textoDeCentavos } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, nomeForma } from "@/lib/rotulos";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import {
  alterarItem,
  alterarPessoas,
  alterarStatusConta,
  cancelarComanda,
  cancelarItem,
  estornarPagamento,
  fecharComanda,
  imprimirConta,
  registrarPagamentos,
} from "../../actions";
import type { DetalheComanda, ItemComanda, PagamentoComanda } from "../../dados";

const MOTIVOS = ["Lançado errado", "Cliente desistiu", "Produto em falta", "Demorou demais"];

function Stepper({ valor, aoMudar, rotulo }: { valor: number; aoMudar: (n: number) => void; rotulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={`Diminuir ${rotulo}`}
        disabled={valor <= 1}
        onClick={() => aoMudar(valor - 1)}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
        {valor}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={`Aumentar ${rotulo}`}
        disabled={valor >= 99}
        onClick={() => aoMudar(valor + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

function LinhaItem({ item, editavel }: { item: ItemComanda; editavel: boolean }) {
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
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 rounded-md py-2 text-left disabled:cursor-default"
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
          {item.preparo === "pronto" ? (
            <span className="mt-0.5 w-fit rounded-full bg-green-600 px-2 py-0.5 text-xs font-bold text-white">Pronto p/ servir</span>
          ) : item.preparo === "na_cozinha" ? (
            <span className="text-xs font-medium text-muted-foreground">Na cozinha</span>
          ) : null}
          {item.observacao ? <span className="text-sm text-muted-foreground">Obs.: {item.observacao}</span> : null}
        </span>
        <span className="font-medium tabular-nums">{formatarBRL(item.total)}</span>
      </button>

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

// Calculadora da conta separada: marca o que cada um consumiu (quantas unidades de cada item)
// e mostra quanto a pessoa paga. Não grava nada; o valor vai para o pagamento.
function CalculadoraItens({ itens, aoUsar }: { itens: ItemComanda[]; aoUsar: (valor: number) => void }) {
  const [escolhidos, setEscolhidos] = useState<Record<string, number>>({});
  const ativos = itens.filter((i) => !i.cancelado);
  const total = ativos.reduce((soma, i) => soma + (escolhidos[i.id] ?? 0) * i.precoUnitario, 0);
  const mudar = (item: ItemComanda, n: number) =>
    setEscolhidos((e) => ({ ...e, [item.id]: Math.max(0, Math.min(item.quantidade, n)) }));

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
      <p className="text-sm text-muted-foreground">Marque o que esta pessoa consumiu.</p>
      <ul className="flex flex-col divide-y">
        {ativos.map((i) => {
          const n = escolhidos[i.id] ?? 0;
          return (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-col">
                <span className={cn("truncate", n > 0 && "font-semibold")}>
                  {i.quantidade}× {i.nome}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatarBRL(i.precoUnitario)} cada{i.adicionais.length > 0 ? ` · ${resumoAdicionais(i.adicionais)}` : ""}
                </span>
              </span>
              {i.quantidade === 1 ? (
                <Button
                  type="button"
                  variant={n > 0 ? "default" : "outline"}
                  className="h-11 min-w-20"
                  aria-pressed={n > 0}
                  onClick={() => mudar(i, n > 0 ? 0 : 1)}
                >
                  {n > 0 ? <Check /> : null}
                  {n > 0 ? "Marcado" : "Marcar"}
                </Button>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Menos ${i.nome}`} disabled={n === 0} onClick={() => mudar(i, n - 1)}>
                    <Minus />
                  </Button>
                  <span className="w-12 text-center font-semibold tabular-nums">
                    {n}/{i.quantidade}
                  </span>
                  <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Mais ${i.nome}`} disabled={n >= i.quantidade} onClick={() => mudar(i, n + 1)}>
                    <Plus />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold tabular-nums">{formatarBRL(total)}</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-11" disabled={total === 0} onClick={() => setEscolhidos({})}>
            Limpar
          </Button>
          <Button type="button" className="h-11" disabled={total === 0} onClick={() => aoUsar(total)}>
            Cobrar {formatarBRL(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}

type Parte = { chave: number; forma: string; valorTexto: string; recebidoTexto: string };

let proximaChave = 1;
const novaParte = (forma: string, valor: number): Parte => ({
  chave: proximaChave++,
  forma,
  valorTexto: valor > 0 ? textoDeCentavos(valor) : "",
  recebidoTexto: "",
});

function PainelPagamento({
  comandaId,
  total,
  falta,
  pessoas,
  itens,
  aoFechar,
}: {
  comandaId: string;
  total: number;
  falta: number;
  pessoas: number | null;
  itens: ItemComanda[];
  aoFechar: () => void;
}) {
  // Uma ou mais formas (pagamento combinado: parte no Pix, parte no cartão...).
  const [partes, setPartes] = useState<Parte[]>(() => [novaParte("pix", falta)]);
  const [faltaBase, setFaltaBase] = useState(falta);
  const [calculando, setCalculando] = useState(false);
  // Valor que esta pessoa vai pagar (calculadora ou "1 de N"); sem ele, a conta toda.
  const [alvo, setAlvo] = useState<number | null>(null);
  const { pendente, executar } = useAcao();
  const secao = useRef<HTMLElement>(null);

  // Registrou um pagamento (aqui ou em outro aparelho): recomeça com o que falta agora.
  if (falta !== faltaBase) {
    setFaltaBase(falta);
    setPartes([novaParte("pix", falta)]);
    setAlvo(null);
  }

  // O painel abre abaixo da lista; no celular ficaria fora da tela.
  useEffect(() => {
    secao.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const valores = partes.map((p) => centavosDeTexto(p.valorTexto));
  const invalido = valores.some((v) => v === null || v <= 0);
  const soma = valores.reduce<number>((s, v) => s + (v ?? 0), 0);
  const acima = soma > falta;
  const restante = Math.max(0, Math.min(alvo ?? falta, falta) - soma);
  const trocoDe = (p: Parte, v: number | null) => {
    const recebido = p.forma === "dinheiro" && p.recebidoTexto ? centavosDeTexto(p.recebidoTexto) : null;
    return recebido !== null && v !== null ? recebido - v : null;
  };
  const trocoNegativo = partes.some((p, n) => (trocoDe(p, valores[n]) ?? 0) < 0);
  // Parte de cada pessoa sobre o total da conta (não sobre o que falta), limitada ao que falta.
  const porPessoa = pessoas && pessoas > 1 ? Math.min(falta, Math.ceil(total / pessoas)) : null;

  const mudar = (chave: number, campo: Partial<Parte>) => setPartes((ps) => ps.map((p) => (p.chave === chave ? { ...p, ...campo } : p)));
  // Valor de uma forma só (atalhos "Tudo", "por pessoa", calculadora): vira uma parte única.
  const usarValor = (valor: number, daPessoa: boolean) => {
    setAlvo(daPessoa ? valor : null);
    setPartes((ps) => [{ ...ps[0], valorTexto: textoDeCentavos(valor), recebidoTexto: "" }]);
  };

  return (
    <section
      ref={secao}
      aria-labelledby="titulo-pagamento"
      className="flex scroll-mt-4 flex-col gap-4 rounded-xl border-2 border-[var(--cor-primaria)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 id="titulo-pagamento" className="text-lg font-semibold">
          Registrar pagamento
        </h2>
        <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Fechar" onClick={aoFechar}>
          <X />
        </Button>
      </div>

      {falta === 0 ? (
        <p role="status" className="rounded-lg bg-green-50 p-3 font-medium text-green-800">
          Esta conta já foi paga. Confira a lista de pagamentos.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => usarValor(falta, false)}>
              Tudo ({formatarBRL(falta)})
            </Button>
            {porPessoa ? (
              <Button type="button" variant="outline" className="h-11" onClick={() => usarValor(porPessoa, true)}>
                1 de {pessoas} ({formatarBRL(porPessoa)})
              </Button>
            ) : null}
            <Button
              type="button"
              variant={calculando ? "default" : "outline"}
              className="h-11"
              aria-expanded={calculando}
              onClick={() => setCalculando((c) => !c)}
            >
              <Calculator />
              Por item
            </Button>
          </div>

          {calculando ? (
            <CalculadoraItens
              itens={itens}
              aoUsar={(valor) => {
                usarValor(Math.min(valor, falta), true);
                setCalculando(false);
              }}
            />
          ) : null}

          {partes.map((p, n) => {
            const troco = trocoDe(p, valores[n]);
            return (
              <fieldset key={p.chave} className={cn("flex flex-col gap-3", partes.length > 1 && "rounded-lg border p-3")}>
                <legend className="flex w-full items-center justify-between text-sm font-medium">
                  {partes.length > 1 ? `Forma ${n + 1}` : "Forma"}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAS_PAGAMENTO.map((f) => (
                    <Button
                      key={f.valor}
                      type="button"
                      variant={p.forma === f.valor ? "default" : "outline"}
                      className="h-12"
                      aria-pressed={p.forma === f.valor}
                      onClick={() => mudar(p.chave, { forma: f.valor })}
                    >
                      {f.rotulo}
                    </Button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-2 text-sm font-medium">
                    Valor (R$)
                    <Input
                      value={p.valorTexto}
                      onChange={(e) => mudar(p.chave, { valorTexto: e.target.value })}
                      inputMode="decimal"
                      className="h-12 text-lg"
                      aria-invalid={valores[n] === null || acima}
                    />
                  </label>
                  {partes.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-12"
                      aria-label={`Tirar a forma ${n + 1}`}
                      onClick={() => setPartes((ps) => ps.filter((x) => x.chave !== p.chave))}
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
                {p.forma === "dinheiro" ? (
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Recebido em dinheiro (para calcular o troco)
                    <Input
                      value={p.recebidoTexto}
                      onChange={(e) => mudar(p.chave, { recebidoTexto: e.target.value })}
                      inputMode="decimal"
                      placeholder="Ex.: 100,00"
                      className="h-12 text-lg"
                    />
                    {troco !== null && troco > 0 ? <span className="text-base font-semibold">Troco: {formatarBRL(troco)}</span> : null}
                    {troco !== null && troco < 0 ? <span className="text-sm text-destructive">Recebido é menor que o valor.</span> : null}
                  </label>
                ) : null}
              </fieldset>
            );
          })}

          {partes.length < 5 ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 self-start"
              disabled={restante === 0}
              onClick={() => setPartes((ps) => [...ps, novaParte(ps.some((x) => x.forma === "pix") ? "credito" : "pix", restante)])}
            >
              <Plus />
              Outra forma {restante > 0 ? `(${formatarBRL(restante)})` : ""}
            </Button>
          ) : null}

          {partes.length > 1 ? (
            <p className="text-sm text-muted-foreground" role="status">
              Somando: <strong className="text-foreground">{formatarBRL(soma)}</strong>
              {restante > 0 ? ` · faltam ${formatarBRL(restante)} ${alvo !== null ? "desta pessoa" : "na conta"}` : ""}
            </p>
          ) : null}

          {acima ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              Passa do que falta ({formatarBRL(falta)}). Para dar troco no dinheiro, preencha o recebido.
            </p>
          ) : null}

          <Button
            type="button"
            className="h-14 text-lg"
            disabled={pendente || invalido || acima || trocoNegativo}
            onClick={() =>
              executar(
                () => registrarPagamentos(comandaId, partes.map((p, n) => ({ forma: p.forma, valor: valores[n] ?? 0 }))),
                () => {
                  if (soma >= falta) aoFechar();
                },
              )
            }
          >
            {pendente ? "Registrando..." : `Registrar ${soma > 0 ? formatarBRL(soma) : ""}`}
          </Button>
        </>
      )}
    </section>
  );
}

const MOTIVOS_ESTORNO = ["Valor errado", "Forma errada", "Cobrado em dobro"];

function LinhaPagamento({
  pagamento: p,
  podeEstornar,
  fusoHorario,
}: {
  pagamento: PagamentoComanda;
  podeEstornar: boolean;
  fusoHorario: string;
}) {
  const [estornando, setEstornando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { pendente, executar } = useAcao();

  return (
    <li className={cn("flex flex-col gap-2 py-2", p.estornado && "text-muted-foreground")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className={cn("font-medium", p.estornado && "line-through")}>
            {nomeForma(p.forma)} · {formatarBRL(p.valor)}
          </span>
          <span className="text-xs text-muted-foreground">
            {horaLocal(p.criadoEm, fusoHorario)} · {p.registradoPor ?? "—"}
            {p.estornado ? ` · estornado${p.motivoEstorno ? `: ${p.motivoEstorno}` : ""}` : ""}
          </span>
        </span>
        {podeEstornar && !p.estornado && !estornando ? (
          <Button type="button" variant="ghost" className="h-11" onClick={() => setEstornando(true)}>
            <Undo2 />
            Estornar
          </Button>
        ) : null}
      </div>
      {estornando ? (
        <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
          <span className="text-sm font-medium">Por que estornar {formatarBRL(p.valor)}?</span>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_ESTORNO.map((m) => (
              <Button key={m} type="button" variant={motivo === m ? "default" : "outline"} className="h-11" onClick={() => setMotivo(m)}>
                {m}
              </Button>
            ))}
          </div>
          <Input
            value={MOTIVOS_ESTORNO.includes(motivo) ? "" : motivo}
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
              onClick={() => executar(() => estornarPagamento(p.id, motivo), () => setEstornando(false))}
            >
              Confirmar estorno
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setEstornando(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// Histórico da mesa: um grupo por pedido (cada lançamento do garçom), na ordem em que saíram.
function agruparPorPedido(itens: ItemComanda[]) {
  const grupos = new Map<number, { numero: number; criadoEm: string; autor: string | null; total: number; itens: ItemComanda[] }>();
  for (const i of itens) {
    const g = grupos.get(i.pedidoNumero) ?? { numero: i.pedidoNumero, criadoEm: i.pedidoCriadoEm, autor: i.pedidoAutor, total: 0, itens: [] };
    g.itens.push(i);
    if (!i.cancelado) g.total += i.total;
    grupos.set(i.pedidoNumero, g);
  }
  return [...grupos.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

// Tudo junto: o mesmo produto (com as mesmas opções e observação) somado num item só.
function ResumoItens({ itens }: { itens: ItemComanda[] }) {
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

// Chegou ou saiu gente: o garçom muda a quantidade de pessoas com a mesa aberta.
function EditarPessoas({ comandaId, pessoas }: { comandaId: string; pessoas: number | null }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(pessoas ?? 1);
  const { pendente, executar } = useAcao();

  if (!editando) {
    return (
      <button
        type="button"
        className="flex min-h-11 items-center gap-1 rounded-md px-1 underline-offset-4 hover:underline"
        onClick={() => {
          setValor(pessoas ?? 1);
          setEditando(true);
        }}
      >
        · {pessoas ? `${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}` : "pessoas?"}
        <Pencil className="size-3.5" aria-hidden />
        <span className="sr-only">Mudar a quantidade de pessoas</span>
      </button>
    );
  }
  return (
    <div className="flex w-full items-center gap-2 rounded-lg bg-muted/60 p-2" role="group" aria-label="Quantidade de pessoas">
      <Stepper valor={valor} aoMudar={setValor} rotulo="pessoas" />
      <span className="text-sm">{valor === 1 ? "pessoa" : "pessoas"}</span>
      <Button
        type="button"
        className="ml-auto h-11"
        disabled={pendente || valor === pessoas}
        onClick={() => executar(() => alterarPessoas(comandaId, valor), () => setEditando(false))}
      >
        Salvar
      </Button>
      <Button type="button" variant="ghost" className="h-11" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
    </div>
  );
}

type Props = {
  mesaId: string;
  // De onde a tela foi aberta: define para onde voltar depois de fechar/lançar.
  origem?: "garcom" | "painel";
  comanda: DetalheComanda;
  podeGerenciar: boolean;
  fusoHorario: string;
};

export function TelaComanda({ mesaId, comanda, podeGerenciar, fusoHorario, origem = "garcom" }: Props) {
  const router = useRouter();
  const [pagando, setPagando] = useState(false);
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  // Histórico por pedido (cada rodada separada) ou tudo somado por produto.
  const [visao, setVisao] = useState<"pedidos" | "resumo">("pedidos");
  const { pendente, executar } = useAcao();

  // Fechar a comanda não tem volta: o primeiro toque só arma (desarma sozinho em 6 s).
  useEffect(() => {
    if (!confirmarFechar) return;
    const t = setTimeout(() => setConfirmarFechar(false), 6000);
    return () => clearTimeout(t);
  }, [confirmarFechar]);

  const falta = Math.max(0, comanda.total - comanda.pago);
  const quitada = comanda.total > 0 && comanda.pago >= comanda.total;
  const pagoAMais = Math.max(0, comanda.pago - comanda.total);
  // Fecha quando está paga; se todos os itens foram cancelados (total zero), fecha sem pagamento.
  const podeFechar = comanda.itens.length > 0 && comanda.pago >= comanda.total;
  const itensAtivos = comanda.itens.filter((i) => !i.cancelado);
  const voltarAoMapa = () => router.push(origem === "painel" ? "/painel/comandas" : "/garcom");

  return (
    <div className="flex flex-1 flex-col gap-5 pb-44">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {comanda.status === "conta_pedida" ? (
          <Badge className="bg-amber-300 text-amber-950">Conta pedida</Badge>
        ) : (
          <Badge>Ocupada</Badge>
        )}
        <span>desde {horaLocal(comanda.abertaEm, fusoHorario)}</span>
        <EditarPessoas comandaId={comanda.id} pessoas={comanda.pessoas} />
        {comanda.garcom ? <span>· {comanda.garcom}</span> : null}
      </div>

      <section aria-labelledby="titulo-itens">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 id="titulo-itens" className="text-lg font-semibold">
            Itens
          </h2>
          {comanda.itens.length > 0 ? (
            <div className="flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Como ver os itens">
              {(["pedidos", "resumo"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  onClick={() => setVisao(v)}
                  className={cn("min-h-9 rounded-md px-3", visao === v ? "bg-muted font-semibold" : "text-muted-foreground")}
                >
                  {v === "pedidos" ? "Por pedido" : "Tudo junto"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {comanda.itens.length === 0 ? (
          <p className="py-4 text-muted-foreground">Nenhum item lançado ainda.</p>
        ) : visao === "resumo" ? (
          <ResumoItens itens={comanda.itens} />
        ) : (
          <ol className="flex flex-col gap-3">
            {agruparPorPedido(comanda.itens).map((g) => (
              <li key={g.numero} className="rounded-xl border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-semibold">
                    Pedido nº {g.numero} · {horaLocal(g.criadoEm, fusoHorario)}
                    {g.autor ? <span className="font-normal text-muted-foreground"> · {g.autor}</span> : null}
                  </span>
                  <span className="font-semibold tabular-nums">{formatarBRL(g.total)}</span>
                </div>
                <ul className="divide-y px-3">
                  {g.itens.map((item) => (
                    <LinhaItem key={item.id} item={item} editavel />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Totais" className="flex flex-col gap-1 rounded-xl bg-muted/60 p-4">
        <div className="flex justify-between text-lg font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatarBRL(comanda.total)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Pago</span>
          <span className="tabular-nums">{formatarBRL(comanda.pago)}</span>
        </div>
        {pagoAMais > 0 ? (
          <div className="flex justify-between font-semibold text-amber-800">
            <span>Pago a mais (estorne o excedente)</span>
            <span className="tabular-nums">{formatarBRL(pagoAMais)}</span>
          </div>
        ) : (
          <div className={cn("flex justify-between font-semibold", quitada ? "text-green-700" : comanda.total === 0 ? "text-muted-foreground" : "text-destructive")}>
            <span>{quitada ? "Quitada" : "Falta"}</span>
            <span className="tabular-nums">{formatarBRL(falta)}</span>
          </div>
        )}
      </section>

      {comanda.pagamentos.length > 0 ? (
        <section aria-labelledby="titulo-pagamentos">
          <h2 id="titulo-pagamentos" className="mb-1 text-lg font-semibold">
            Pagamentos
          </h2>
          <ul className="divide-y">
            {comanda.pagamentos.map((p) => (
              <LinhaPagamento key={p.id} pagamento={p} podeEstornar={podeGerenciar} fusoHorario={fusoHorario} />
            ))}
          </ul>
        </section>
      ) : null}

      {pagando ? (
        <PainelPagamento
          comandaId={comanda.id}
          total={comanda.total}
          falta={falta}
          pessoas={comanda.pessoas}
          itens={comanda.itens}
          aoFechar={() => setPagando(false)}
        />
      ) : null}

      {podeGerenciar && itensAtivos.length === 0 && comanda.pago === 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start text-destructive"
          disabled={pendente}
          onClick={() => executar(() => cancelarComanda(comanda.id), voltarAoMapa)}
        >
          Cancelar comanda (abriu por engano)
        </Button>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Button className="h-14 text-base" nativeButton={false} render={<Link href={`/garcom/mesas/${mesaId}/lancar${origem === "painel" ? "?voltar=painel" : ""}`} />}>
            <UtensilsCrossed />
            Lançar itens
          </Button>
          {podeFechar ? (
            <Button
              type="button"
              className={cn(
                "h-14 text-base text-white",
                confirmarFechar ? "bg-green-900 ring-4 ring-green-300 hover:bg-green-900" : "bg-green-700 hover:bg-green-800",
              )}
              disabled={pendente}
              onClick={() =>
                confirmarFechar ? executar(() => fecharComanda(comanda.id), voltarAoMapa) : setConfirmarFechar(true)
              }
            >
              <Check />
              {confirmarFechar ? "Toque de novo para fechar" : "Fechar comanda"}
            </Button>
          ) : comanda.status === "aberta" ? (
            <Button
              type="button"
              variant="outline"
              className="h-14 text-base"
              disabled={pendente || itensAtivos.length === 0}
              onClick={() => executar(() => alterarStatusConta(comanda.id, true))}
            >
              <ReceiptText />
              Pedir conta
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-14 text-base"
              disabled={pendente || pagando}
              onClick={() => setPagando(true)}
            >
              <Wallet />
              Pagamento
            </Button>
          )}
          {comanda.status === "conta_pedida" ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-sm"
              disabled={pendente}
              onClick={() => executar(() => imprimirConta(comanda.id))}
            >
              <Printer />
              Imprimir conta
            </Button>
          ) : null}
          {comanda.status === "conta_pedida" && !podeFechar ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-sm"
              disabled={pendente}
              onClick={() => executar(() => alterarStatusConta(comanda.id, false))}
            >
              Voltar para aberta
            </Button>
          ) : null}
          {comanda.status === "aberta" && !quitada && itensAtivos.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="col-span-2 h-10 text-sm"
              disabled={pendente || pagando}
              onClick={() => setPagando(true)}
            >
              <Wallet />
              Registrar pagamento
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
