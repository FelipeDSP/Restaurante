"use client";

import { Download, Laptop } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VALIDADE_CODIGO_MIN } from "@/lib/impressao/constantes";
import { horaLocal, tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { conectarComputador, desconectarComputador, gerarNovoCodigo, type ResultadoCodigo } from "./actions";
import type { Computador } from "./dados";

const SITUACAO: Record<Computador["situacao"], { rotulo: string; classe: string }> = {
  online: { rotulo: "Imprimindo", classe: "bg-green-100 text-green-800" },
  offline: { rotulo: "Sem sinal", classe: "bg-red-100 text-red-800" },
  aguardando: { rotulo: "Aguardando o código", classe: "bg-amber-100 text-amber-900" },
  desconectado: { rotulo: "Desconectado", classe: "bg-muted text-muted-foreground" },
};

// Código ainda útil: nenhum pareamento aconteceu depois que ele foi gerado.
function codigoEmUso(resultado: ResultadoCodigo, pareadoEm: (string | null)[]): resultado is NonNullable<ResultadoCodigo> & { codigo: string; expiraEm: string } {
  if (!resultado?.codigo || !resultado.expiraEm) return false;
  const geradoEm = new Date(resultado.expiraEm).getTime() - VALIDADE_CODIGO_MIN * 60_000;
  return !pareadoEm.some((p) => p && new Date(p).getTime() >= geradoEm);
}

function CodigoPareamento({ codigo, expiraEm, fuso }: { codigo: string; expiraEm: string; fuso: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 p-5 text-center">
      <p className="text-sm font-medium">No computador do caixa, abra o app de impressão e digite:</p>
      <p className="font-mono text-5xl font-bold tracking-[0.2em] tabular-nums">
        {codigo.slice(0, 3)} {codigo.slice(3)}
      </p>
      <p className="text-sm text-muted-foreground">Vale até {horaLocal(expiraEm, fuso)}. Depois disso, gere outro.</p>
    </div>
  );
}

function LinhaComputador({ computador, fuso, dono }: { computador: Computador; fuso: string; dono: boolean }) {
  const { pendente, executar } = useAcao();
  const [codigo, setCodigo] = useState<ResultadoCodigo>(undefined);
  const situacao = SITUACAO[computador.situacao];

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Laptop className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-medium">{computador.nome}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", situacao.classe)}>{situacao.rotulo}</span>
        {/* "há X min" pode virar o minuto entre o servidor e o navegador. */}
        <span className="text-sm text-muted-foreground" suppressHydrationWarning>
          {computador.ultimoContatoEm ? `último sinal ${tempoDesde(computador.ultimoContatoEm)}` : ""}
          {computador.versao ? ` · app ${computador.versao}` : ""}
        </span>
        {dono ? (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendente}
              onClick={() =>
                executar(async () => {
                  const r = await gerarNovoCodigo(computador.id);
                  setCodigo(r);
                  return r?.ok ? undefined : r;
                })
              }
            >
              {computador.situacao === "aguardando" ? "Gerar código" : "Parear de novo"}
            </Button>
            {computador.situacao !== "desconectado" ? (
              <Button type="button" variant="ghost" size="sm" disabled={pendente} onClick={() => executar(() => desconectarComputador(computador.id))}>
                Desconectar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {codigoEmUso(codigo, [computador.pareadoEm]) ? <CodigoPareamento codigo={codigo.codigo} expiraEm={codigo.expiraEm} fuso={fuso} /> : null}
      {computador.situacao === "offline" ? (
        <p className="text-sm text-red-800">
          O app não responde. Confira se o computador está ligado, com internet, e se o app está aberto (ícone perto do relógio).
        </p>
      ) : null}
    </li>
  );
}

function ComoInstalar({ endereco }: { endereco: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-4 text-sm">
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>
          No computador do caixa, baixe e abra o instalador. Se o Windows avisar &quot;O Windows protegeu o computador&quot;, clique em{" "}
          <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>.
        </li>
        <li>
          Clique em <strong>Conectar computador</strong> aqui embaixo e digite o código no app, com o endereço{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono">{endereco}</code>.
        </li>
        <li>Cadastre as impressoras e use &quot;Imprimir teste&quot; em cada uma.</li>
      </ol>
      <p className="text-muted-foreground">
        O app fica perto do relógio, abre junto com o Windows e se atualiza sozinho. Funciona com qualquer impressora térmica (rede ou USB) e com
        impressoras comuns pelo driver do Windows.
      </p>
      <a href="/downloads/impressao/instalador" download className={cn(buttonVariants({ variant: "outline" }), "h-11 self-start")}>
        <Download aria-hidden />
        Baixar o app de impressão (Windows)
      </a>
    </div>
  );
}

export function Computadores({
  computadores,
  fuso,
  dono,
  endereco,
}: {
  computadores: Computador[];
  fuso: string;
  dono: boolean;
  endereco: string;
}) {
  const [estado, acao] = useActionState(conectarComputador, undefined);
  useAvisoResultado(estado?.ok ? undefined : estado);
  const ativos = computadores.filter((c) => c.situacao !== "desconectado");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Computador do caixa</CardTitle>
        <CardDescription>
          O app de impressão roda num computador do restaurante (Windows) e manda os pedidos para as impressoras.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {dono && ativos.length === 0 ? <ComoInstalar endereco={endereco} /> : null}
        {computadores.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {computadores.map((c) => (
              <LinhaComputador key={c.id} computador={c} fuso={fuso} dono={dono} />
            ))}
          </ul>
        ) : null}
        {dono && ativos.length === 0 ? (
          <form key={estado?.chave} action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              Nome do computador
              <Input name="nome" defaultValue={valorCampo(estado, "nome", "Notebook do caixa")} required className="h-11" />
              <ErroCampo estado={estado} campo="nome" />
            </label>
            <BotaoEnviar className="h-11" pendente="Gerando código...">
              Conectar computador
            </BotaoEnviar>
          </form>
        ) : null}
        {codigoEmUso(estado, computadores.map((c) => c.pareadoEm)) ? (
          <CodigoPareamento codigo={estado.codigo} expiraEm={estado.expiraEm} fuso={fuso} />
        ) : null}
        {ativos.length === 0 && !dono ? <Badge variant="outline">Nenhum computador conectado</Badge> : null}
        {ativos.length > 0 ? (
          <a href="/downloads/impressao/instalador" download className="self-start text-sm text-muted-foreground underline underline-offset-4">
            Baixar o app de impressão de novo
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
