"use client";

import { Calculator, Check, Minus, Plus, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Stepper } from "@/components/staff/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resumoAdicionais } from "@/lib/adicionais";
import { centavosDeTexto, formatarBRL, textoDeCentavos } from "@/lib/dinheiro";
import { FORMAS_PAGAMENTO, nomeForma } from "@/lib/rotulos";
import { horaLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { estornarPagamento, registrarPagamentos } from "./actions";
import type { DetalheComanda, ItemComanda, PagamentoComanda } from "./dados";

// Receber a mesa: a calculadora da conta separada (marca o que cada um consumiu), o painel de
// pagamento (várias formas num envio) e a lista do que já foi pago, com estorno.
// Saiu de tela-comanda.tsx, que tinha mil linhas.

// Calculadora da conta separada: marca o que cada um consumiu (quantas unidades de cada item)
// e mostra quanto a pessoa paga. O que foi marcado vai junto com o pagamento; a próxima pessoa
// só vê o que ainda não foi pago.
function CalculadoraItens({
  itens,
  servicoPercentual,
  couvertPorPessoa,
  aoUsar,
}: {
  itens: ItemComanda[];
  // Só o que está sendo cobrado na mesa (0 quando foi retirado).
  servicoPercentual: number;
  couvertPorPessoa: number;
  aoUsar: (valor: number, itens: { itemId: string; quantidade: number }[]) => void;
}) {
  const [escolhidos, setEscolhidos] = useState<Record<string, number>>({});
  const ativos = itens.filter((i) => !i.cancelado && i.pagos < i.quantidade);
  const jaPagos = itens.filter((i) => !i.cancelado && i.pagos >= i.quantidade).length;
  const consumo = ativos.reduce((soma, i) => soma + (escolhidos[i.id] ?? 0) * i.precoUnitario, 0);
  const servico = Math.round((consumo * servicoPercentual) / 100);
  const couvert = consumo > 0 ? couvertPorPessoa : 0;
  const total = consumo + servico + couvert;
  const mudar = (item: ItemComanda, n: number) =>
    setEscolhidos((e) => ({ ...e, [item.id]: Math.max(0, Math.min(item.quantidade - item.pagos, n)) }));

  if (ativos.length === 0) {
    return <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">Todos os itens já foram pagos.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3">
      <p className="text-sm text-muted-foreground">
        Marque o que esta pessoa consumiu.{jaPagos > 0 ? ` ${jaPagos === 1 ? "1 item já pago não aparece" : `${jaPagos} itens já pagos não aparecem`}.` : ""}
      </p>
      <ul className="flex flex-col divide-y">
        {ativos.map((i) => {
          const n = escolhidos[i.id] ?? 0;
          const resta = i.quantidade - i.pagos;
          return (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-col">
                <span className={cn("truncate", n > 0 && "font-semibold")}>
                  {resta}× {i.nome}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatarBRL(i.precoUnitario)} cada{i.pagos > 0 ? ` · ${i.pagos} já pago` : ""}{i.adicionais.length > 0 ? ` · ${resumoAdicionais(i.adicionais)}` : ""}
                </span>
              </span>
              {resta === 1 ? (
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
                    {n}/{resta}
                  </span>
                  <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Mais ${i.nome}`} disabled={n >= resta} onClick={() => mudar(i, n + 1)}>
                    <Plus />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <span className="text-lg font-bold tabular-nums">{formatarBRL(total)}</span>
          {servico > 0 || couvert > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatarBRL(consumo)}
              {servico > 0 ? ` + serviço ${formatarBRL(servico)}` : ""}
              {couvert > 0 ? ` + couvert ${formatarBRL(couvert)}` : ""}
            </span>
          ) : null}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-11" disabled={total === 0} onClick={() => setEscolhidos({})}>
            Limpar
          </Button>
          <Button type="button" className="h-11" disabled={total === 0} onClick={() =>
              aoUsar(
                total,
                Object.entries(escolhidos)
                  .filter(([, q]) => q > 0)
                  .map(([itemId, quantidade]) => ({ itemId, quantidade })),
              )
            }
          >
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

export function PainelPagamento({
  comandaId,
  total,
  falta,
  pessoas,
  itens,
  cobranca,
  aoFechar,
  aoFecharMesa,
}: {
  comandaId: string;
  total: number;
  falta: number;
  pessoas: number | null;
  itens: ItemComanda[];
  cobranca: DetalheComanda["cobranca"];
  aoFechar: () => void;
  // O pagamento quitou a conta e a mesa fechou junto.
  aoFecharMesa: () => void;
}) {
  // Uma ou mais formas (pagamento combinado: parte no Pix, parte no cartão...). A forma começa sem
  // escolha: cada pagamento pede a forma de novo (o próximo cliente pode pagar diferente).
  const [partes, setPartes] = useState<Parte[]>(() => [novaParte("", falta)]);
  const [faltaBase, setFaltaBase] = useState(falta);
  const [calculando, setCalculando] = useState(false);
  // Valor que esta pessoa vai pagar (calculadora ou "1 de N"); sem ele, a conta toda.
  const [alvo, setAlvo] = useState<number | null>(null);
  // Itens marcados na calculadora "Por item": vão junto com o pagamento.
  const [marcados, setMarcados] = useState<{ itemId: string; quantidade: number }[]>([]);
  const { pendente, executar } = useAcao();
  const secao = useRef<HTMLElement>(null);

  // Conta dividida por pessoa: depois de um pagamento, a próxima pessoa continua em "1 de N".
  const [dividindo, setDividindo] = useState(false);
  // Em quantos dividir: as pessoas da mesa; sem esse número (mesa aberta pelo QR), escolhe aqui.
  const [divisor, setDivisor] = useState<number | null>(pessoas && pessoas > 1 ? pessoas : null);
  // Parte de cada pessoa sobre o total da conta (não sobre o que falta), limitada ao que falta.
  const porPessoa = divisor && divisor > 1 ? Math.min(falta, Math.ceil(total / divisor)) : null;

  // Registrou um pagamento (aqui ou em outro aparelho): recomeça com o que falta agora, sem forma
  // marcada (um toque a mais não pode cobrar o resto na forma do cliente anterior).
  if (falta !== faltaBase) {
    setFaltaBase(falta);
    const proxima = dividindo && porPessoa ? porPessoa : falta;
    setPartes([novaParte("", proxima)]);
    setAlvo(dividindo && porPessoa ? porPessoa : null);
    setMarcados([]);
  }

  // O painel abre abaixo da lista; no celular ficaria fora da tela.
  useEffect(() => {
    secao.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const valores = partes.map((p) => centavosDeTexto(p.valorTexto));
  const invalido = valores.some((v) => v === null || v <= 0);
  const soma = valores.reduce<number>((s, v) => s + (v ?? 0), 0);
  const acima = soma > falta;
  const quita = soma > 0 && soma >= falta;
  const restante = Math.max(0, Math.min(alvo ?? falta, falta) - soma);
  const trocoDe = (p: Parte, v: number | null) => {
    const recebido = p.forma === "dinheiro" && p.recebidoTexto ? centavosDeTexto(p.recebidoTexto) : null;
    return recebido !== null && v !== null ? recebido - v : null;
  };
  const trocoNegativo = partes.some((p, n) => (trocoDe(p, valores[n]) ?? 0) < 0);
  const semForma = partes.some((p) => !p.forma);

  const mudar = (chave: number, campo: Partial<Parte>) => setPartes((ps) => ps.map((p) => (p.chave === chave ? { ...p, ...campo } : p)));
  // Valor de uma forma só (atalhos "Tudo", "por pessoa", calculadora): vira uma parte única.
  const usarValor = (valor: number, daPessoa: boolean, porDivisao = false) => {
    setDividindo(porDivisao);
    setAlvo(daPessoa ? valor : null);
    setMarcados([]);
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
              <Button type="button" variant="outline" className="h-11" onClick={() => usarValor(porPessoa, true, true)}>
                1 de {divisor} ({formatarBRL(porPessoa)})
              </Button>
            ) : (
              <Button type="button" variant="outline" className="h-11" onClick={() => setDivisor(2)}>
                Dividir
              </Button>
            )}
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

          {divisor && !(pessoas && pessoas > 1) ? (
            <div className="flex items-center gap-3 text-sm font-medium">
              Dividir em
              <Stepper valor={divisor} aoMudar={(n) => setDivisor(Math.max(2, n))} rotulo="em quantas pessoas dividir" />
            </div>
          ) : null}

          {calculando ? (
            <CalculadoraItens
              itens={itens}
              servicoPercentual={cobranca.cobrarServico ? cobranca.servicoPercentual : 0}
              couvertPorPessoa={cobranca.cobrarCouvert ? cobranca.couvertUnitario : 0}
              aoUsar={(valor, escolhidos) => {
                usarValor(Math.min(valor, falta), true);
                setMarcados(escolhidos);
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
                      onFocus={(e) => e.currentTarget.select()}
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
              onClick={() => setPartes((ps) => [...ps, novaParte("", restante)])}
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

          {marcados.length > 0 ? (
            <p className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <span>
                Paga {marcados.reduce((n, m) => n + m.quantidade, 0)}{" "}
                {marcados.reduce((n, m) => n + m.quantidade, 0) === 1 ? "item marcado" : "itens marcados"}
              </span>
              <button type="button" className="font-medium underline" onClick={() => setMarcados([])}>
                Desmarcar
              </button>
            </p>
          ) : null}

          {acima ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              Passa do que falta ({formatarBRL(falta)}). Para dar troco no dinheiro, preencha o recebido.
            </p>
          ) : null}

          {/* Quitou a conta: recebe e já fecha a mesa, sem outro passo. */}
          <Button
            type="button"
            className={cn("h-14 text-lg", quita && "bg-green-700 text-white hover:bg-green-800")}
            disabled={pendente || invalido || acima || trocoNegativo || semForma}
            onClick={() =>
              executar(
                () =>
                  registrarPagamentos(
                    comandaId,
                    partes.map((p, n) => ({ forma: p.forma, valor: valores[n] ?? 0 })),
                    marcados,
                    quita,
                  ),
                quita ? aoFecharMesa : undefined,
              )
            }
          >
            {pendente
              ? "Registrando..."
              : semForma
                ? "Escolha a forma de pagamento"
                : quita
                  ? `Receber ${formatarBRL(soma)} e fechar mesa`
                  : `Receber ${soma > 0 ? formatarBRL(soma) : ""}`}
          </Button>
        </>
      )}
    </section>
  );
}

const MOTIVOS_ESTORNO = ["Valor errado", "Forma errada", "Cobrado em dobro"];

export function LinhaPagamento({
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
