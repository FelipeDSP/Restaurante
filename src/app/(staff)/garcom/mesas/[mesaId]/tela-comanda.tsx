"use client";

import { Check, Minus, Plus, Printer, ReceiptText, Undo2, UtensilsCrossed, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  alterarStatusConta,
  cancelarComanda,
  cancelarItem,
  estornarPagamento,
  fecharComanda,
  imprimirConta,
  registrarPagamento,
} from "../../actions";
import type { DetalheComanda, ItemComanda } from "../../dados";

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
          {item.observacao ? <span className="text-sm text-muted-foreground">Obs.: {item.observacao}</span> : null}
          <span className="text-xs text-muted-foreground">Pedido nº {item.pedidoNumero}</span>
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

function PainelPagamento({
  comandaId,
  falta,
  pessoas,
  aoFechar,
}: {
  comandaId: string;
  falta: number;
  pessoas: number | null;
  aoFechar: () => void;
}) {
  const [forma, setForma] = useState<string>("pix");
  const [valorTexto, setValorTexto] = useState(textoDeCentavos(falta));
  const [recebidoTexto, setRecebidoTexto] = useState("");
  const { pendente, executar } = useAcao();

  const valor = centavosDeTexto(valorTexto);
  const recebido = recebidoTexto ? centavosDeTexto(recebidoTexto) : null;
  const troco = forma === "dinheiro" && valor !== null && recebido !== null ? recebido - valor : null;
  const porPessoa = pessoas && pessoas > 1 ? Math.ceil(falta / pessoas) : null;

  return (
    <section aria-labelledby="titulo-pagamento" className="flex flex-col gap-4 rounded-xl border-2 border-[var(--cor-primaria)] p-4">
      <div className="flex items-center justify-between">
        <h2 id="titulo-pagamento" className="text-lg font-semibold">
          Registrar pagamento
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={aoFechar}>
          <X />
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Forma</legend>
        <div className="grid grid-cols-3 gap-2">
          {FORMAS_PAGAMENTO.map((f) => (
            <Button
              key={f.valor}
              type="button"
              variant={forma === f.valor ? "default" : "outline"}
              className="h-12"
              aria-pressed={forma === f.valor}
              onClick={() => setForma(f.valor)}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2 text-sm font-medium">
        Valor (R$)
        <Input
          value={valorTexto}
          onChange={(e) => setValorTexto(e.target.value)}
          inputMode="decimal"
          className="h-12 text-lg"
          aria-invalid={valor === null}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setValorTexto(textoDeCentavos(falta))}>
          Tudo ({formatarBRL(falta)})
        </Button>
        {porPessoa ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setValorTexto(textoDeCentavos(porPessoa))}>
            1 de {pessoas} ({formatarBRL(porPessoa)})
          </Button>
        ) : null}
      </div>

      {forma === "dinheiro" ? (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Recebido em dinheiro (para calcular o troco)
          <Input
            value={recebidoTexto}
            onChange={(e) => setRecebidoTexto(e.target.value)}
            inputMode="decimal"
            placeholder="Ex.: 100,00"
            className="h-12 text-lg"
          />
          {troco !== null && troco > 0 ? (
            <span className="text-base font-semibold text-[var(--cor-primaria)]">Troco: {formatarBRL(troco)}</span>
          ) : null}
          {troco !== null && troco < 0 ? (
            <span className="text-sm text-destructive">Recebido é menor que o valor.</span>
          ) : null}
        </label>
      ) : null}

      {valor !== null && valor > falta && falta > 0 ? (
        <p className="text-sm text-amber-700">O valor é maior que o que falta ({formatarBRL(falta)}).</p>
      ) : null}

      <Button
        type="button"
        className="h-14 text-lg"
        disabled={pendente || valor === null || valor <= 0 || (troco !== null && troco < 0)}
        onClick={() => valor && executar(() => registrarPagamento(comandaId, valor, forma), aoFechar)}
      >
        {pendente ? "Registrando..." : `Registrar ${valor ? formatarBRL(valor) : ""}`}
      </Button>
    </section>
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
  const { pendente, executar } = useAcao();

  const falta = Math.max(0, comanda.total - comanda.pago);
  const quitada = comanda.total > 0 && comanda.pago >= comanda.total;
  // Fecha quando está paga; se todos os itens foram cancelados (total zero), fecha sem pagamento.
  const podeFechar = comanda.itens.length > 0 && comanda.pago >= comanda.total;
  const itensAtivos = comanda.itens.filter((i) => !i.cancelado);
  const voltarAoMapa = () => router.push(origem === "painel" ? "/painel/comandas" : "/garcom");

  return (
    <div className="flex flex-1 flex-col gap-5 pb-28">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {comanda.status === "conta_pedida" ? (
          <Badge className="bg-amber-300 text-amber-950">Conta pedida</Badge>
        ) : (
          <Badge>Aberta</Badge>
        )}
        <span>desde {horaLocal(comanda.abertaEm, fusoHorario)}</span>
        {comanda.pessoas ? <span>· {comanda.pessoas} pessoas</span> : null}
        {comanda.garcom ? <span>· {comanda.garcom}</span> : null}
      </div>

      <section aria-labelledby="titulo-itens">
        <h2 id="titulo-itens" className="mb-1 text-lg font-semibold">
          Itens
        </h2>
        {comanda.itens.length === 0 ? (
          <p className="py-4 text-muted-foreground">Nenhum item lançado ainda.</p>
        ) : (
          <ul className="divide-y">
            {comanda.itens.map((item) => (
              <LinhaItem key={item.id} item={item} editavel />
            ))}
          </ul>
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
        <div className={cn("flex justify-between font-semibold", quitada ? "text-green-700" : comanda.total === 0 ? "text-muted-foreground" : "text-destructive")}>
          <span>{quitada ? "Quitada" : "Falta"}</span>
          <span className="tabular-nums">{formatarBRL(falta)}</span>
        </div>
      </section>

      {comanda.pagamentos.length > 0 ? (
        <section aria-labelledby="titulo-pagamentos">
          <h2 id="titulo-pagamentos" className="mb-1 text-lg font-semibold">
            Pagamentos
          </h2>
          <ul className="divide-y">
            {comanda.pagamentos.map((p) => (
              <li key={p.id} className={cn("flex items-center justify-between gap-2 py-2", p.estornado && "text-muted-foreground")}>
                <span className="flex flex-col">
                  <span className={cn("font-medium", p.estornado && "line-through")}>
                    {nomeForma(p.forma)} · {formatarBRL(p.valor)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {horaLocal(p.criadoEm, fusoHorario)} · {p.registradoPor ?? "—"}
                    {p.estornado ? " · estornado" : ""}
                  </span>
                </span>
                {podeGerenciar && !p.estornado ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pendente}
                    onClick={() => executar(() => estornarPagamento(p.id))}
                  >
                    <Undo2 />
                    Estornar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pagando ? (
        <PainelPagamento
          comandaId={comanda.id}
          falta={falta}
          pessoas={comanda.pessoas}
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
              className="h-14 bg-green-700 text-base text-white hover:bg-green-800"
              disabled={pendente}
              onClick={() => executar(() => fecharComanda(comanda.id), voltarAoMapa)}
            >
              <Check />
              Fechar comanda
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
