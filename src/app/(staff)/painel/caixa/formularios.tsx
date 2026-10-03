"use client";

import { Printer } from "lucide-react";
import { useActionState, useState } from "react";

import { BotaoEnviar, Campo, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { centavosDeTexto, formatarBRL } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import { abrirCaixa, fecharCaixa } from "./actions";

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

export function FecharCaixa({
  sessaoId,
  esperado,
  comandasAbertas,
}: {
  sessaoId: string;
  esperado: number;
  comandasAbertas: number;
}) {
  const [estado, acao] = useActionState(fecharCaixa.bind(null, sessaoId), undefined);
  useAvisoResultado(estado);
  const [contadoTexto, setContadoTexto] = useState(valorCampo(estado, "valor_contado", ""));
  const contado = contadoTexto ? centavosDeTexto(contadoTexto) : null;
  const diferenca = contado === null ? null : contado - esperado;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fechar caixa</CardTitle>
      </CardHeader>
      <CardContent>
        {comandasAbertas > 0 ? (
          <p role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Há {comandasAbertas} {comandasAbertas === 1 ? "comanda aberta" : "comandas abertas"}. Feche todas antes de
            fechar o caixa.
          </p>
        ) : null}
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <fieldset disabled={comandasAbertas > 0} className="flex flex-col gap-4">
            <p className="text-sm">
              Esperado na gaveta: <strong className="tabular-nums">{formatarBRL(esperado)}</strong>
            </p>
            <Campo rotulo="Valor contado na gaveta (R$)" htmlFor="valor_contado">
              <Input
                id="valor_contado"
                name="valor_contado"
                inputMode="decimal"
                value={contadoTexto}
                onChange={(e) => setContadoTexto(e.target.value)}
                required
                className="h-12 text-lg"
              />
              <ErroCampo estado={estado} campo="valor_contado" />
            </Campo>
            {diferenca !== null ? (
              <p
                aria-live="polite"
                className={cn("font-semibold", diferenca === 0 ? "text-green-700" : "text-destructive")}
              >
                {diferenca === 0
                  ? "Bateu certinho."
                  : `${diferenca > 0 ? "Sobrando" : "Faltando"} ${formatarBRL(Math.abs(diferenca))}`}
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
            <BotaoEnviar variant="destructive" className="h-12 text-base" pendente="Fechando...">
              Fechar caixa
            </BotaoEnviar>
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
