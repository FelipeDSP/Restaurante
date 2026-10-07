"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { centavosDeTexto, formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { abrirCaixa, fecharCaixa } from "./actions";
import type { PendenciasFechamento } from "./dados";

export function AbrirCaixa() {
  const [estado, acao] = useActionState(abrirCaixa, undefined);
  useAvisoResultado(estado);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Abrir caixa</CardTitle>
      </CardHeader>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <Campo rotulo="Troco inicial na gaveta (R$)" htmlFor="valor_inicial" dica="Dinheiro que já está no caixa ao abrir.">
            <Input
              id="valor_inicial"
              name="valor_inicial"
              inputMode="decimal"
              defaultValue={valorCampo(estado, "valor_inicial", "0,00")}
              required
              className="h-12 text-lg"
            />
            <ErroCampo estado={estado} campo="valor_inicial" />
          </Campo>
          <BotaoEnviar className="h-12 text-base" pendente="Abrindo...">
            Abrir caixa
          </BotaoEnviar>
        </form>
      </CardContent>
    </Card>
  );
}

const NOME_STATUS_DELIVERY: Record<string, string> = {
  recebido: "novo, sem aceite",
  em_preparo: "em preparo",
  pronto: "pronto",
  saiu_entrega: "saiu para entrega",
};

export function FecharCaixa({
  sessaoId,
  esperado,
  pendencias,
}: {
  sessaoId: string;
  esperado: number;
  pendencias: PendenciasFechamento;
}) {
  const [estado, acao] = useActionState(fecharCaixa.bind(null, sessaoId), undefined);
  useAvisoResultado(estado);
  const [contadoTexto, setContadoTexto] = useState(valorCampo(estado, "valor_contado", ""));
  const [confirmando, setConfirmando] = useState(false);
  const contado = contadoTexto ? centavosDeTexto(contadoTexto) : null;
  const diferenca = contado === null ? null : contado - esperado;
  const bloqueado = pendencias.comandas.length > 0 || pendencias.deliveries.length > 0;
  const textoDiferenca =
    diferenca === null
      ? ""
      : diferenca === 0
        ? "Bateu certinho."
        : `${diferenca > 0 ? "Sobrando" : "Faltando"} ${formatarBRL(Math.abs(diferenca))}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fechar caixa</CardTitle>
      </CardHeader>
      <CardContent>
        {bloqueado ? (
          <div role="status" className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Antes de fechar o caixa, finalize:</p>
            <ul className="flex flex-col gap-1">
              {pendencias.comandas.map((c) => (
                <li key={c.mesaId}>
                  <Link href={`/painel/comandas/${c.mesaId}`} className="font-medium underline underline-offset-4">
                    Mesa {c.mesa}
                  </Link>{" "}
                  · comanda aberta
                </li>
              ))}
              {pendencias.deliveries.map((d) => (
                <li key={d.numero}>
                  <Link href="/painel/delivery" className="font-medium underline underline-offset-4">
                    Delivery nº {d.numero}
                  </Link>{" "}
                  · {NOME_STATUS_DELIVERY[d.status] ?? d.status}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <fieldset disabled={bloqueado} className="flex flex-col gap-4">
            <p className="text-sm">
              Esperado na gaveta: <strong className="tabular-nums">{formatarBRL(esperado)}</strong>
            </p>
            <Campo rotulo="Valor contado na gaveta (R$)" htmlFor="valor_contado">
              <Input
                id="valor_contado"
                name="valor_contado"
                inputMode="decimal"
                value={contadoTexto}
                onChange={(e) => {
                  setContadoTexto(e.target.value);
                  setConfirmando(false);
                }}
                required
                className="h-12 text-lg"
              />
              <ErroCampo estado={estado} campo="valor_contado" />
            </Campo>
            {diferenca !== null ? (
              <p aria-live="polite" className={cn("font-semibold", diferenca === 0 ? "text-green-700" : "text-destructive")}>
                {textoDiferenca}
              </p>
            ) : null}
            <Campo rotulo="Observação (opcional)" htmlFor="observacao">
              <Textarea
                id="observacao"
                name="observacao"
                rows={2}
                maxLength={500}
                defaultValue={valorCampo(estado, "observacao", "")}
                placeholder="Ex.: sangria de R$ 100,00 às 22h"
              />
            </Campo>
            {estado && !estado.ok && estado.mensagem ? (
              <p role="alert" className="text-sm text-destructive">
                {estado.mensagem}
              </p>
            ) : null}
            {/* Fechar não tem volta: confirma com a contagem na frente. */}
            {confirmando ? (
              <div className="flex flex-col gap-2 rounded-lg border-2 border-destructive p-3">
                <p className="font-semibold">
                  Fechar o caixa com {formatarBRL(contado ?? 0)} contados{diferenca ? ` (${textoDiferenca})` : ""}? Depois de fechado, não reabre.
                </p>
                <div className="flex flex-wrap gap-2">
                  <BotaoEnviar variant="destructive" className="h-12 flex-1 text-base" pendente="Fechando...">
                    Confirmar fechamento
                  </BotaoEnviar>
                  <Button type="button" variant="ghost" className="h-12" onClick={() => setConfirmando(false)}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="destructive"
                className="h-12 bg-destructive text-base text-white hover:bg-destructive/90"
                disabled={contado === null}
                onClick={() => setConfirmando(true)}
              >
                Fechar caixa
              </Button>
            )}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer />
      Imprimir
    </Button>
  );
}
