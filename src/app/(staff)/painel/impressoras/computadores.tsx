"use client";

import { Download, Laptop } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VALIDADE_CODIGO_MIN } from "@/lib/impressao/constantes";
import { horaLocal, tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { conectarComputador, desconectarComputador, excluirComputador, gerarNovoCodigo, type ResultadoCodigo } from "./actions";
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

function CodigoPareamento({ codigo, expiraEm, fuso, endereco }: { codigo: string; expiraEm: string; fuso: string; endereco: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 p-5 text-center">
      <p className="text-sm font-medium">No computador do caixa, abra o app de impressão e digite:</p>
      <p className="font-mono text-5xl font-bold tracking-[0.2em] tabular-nums">
        {codigo.slice(0, 3)} {codigo.slice(3)}
      </p>
      <p className="text-sm text-muted-foreground">
        Endereço: <span className="font-mono text-foreground">{endereco}</span> · vale até {horaLocal(expiraEm, fuso)}
      </p>
    </div>
  );
}

function LinhaComputador({ computador, fuso, dono, endereco }: { computador: Computador; fuso: string; dono: boolean; endereco: string }) {
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
              <BotaoConfirmar
                rotulo={`Desconectar ${computador.nome}`}
                confirmar="Confirmar: desconectar"
                icone={false}
                desabilitado={pendente}
                aoConfirmar={() => executar(() => desconectarComputador(computador.id))}
              >
                Desconectar
              </BotaoConfirmar>
            ) : null}
            <BotaoConfirmar
              rotulo={`Excluir ${computador.nome}`}
              desabilitado={pendente}
              aoConfirmar={() => executar(() => excluirComputador(computador.id))}
            />
          </div>
        ) : null}
      </div>
      {codigoEmUso(codigo, [computador.pareadoEm]) ? <CodigoPareamento codigo={codigo.codigo} expiraEm={codigo.expiraEm} fuso={fuso} endereco={endereco} /> : null}
      {computador.situacao === "offline" ? (
        <p className="text-sm text-red-800">
          O app não responde. Confira se o computador está ligado, com internet, e se o app está aberto (ícone perto do relógio).
        </p>
      ) : null}
    </li>
  );
}

// Passo 1 de 2 (o passo 2 é o "Conectar computador" logo abaixo).
function ComoInstalar() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">1. Instale o app no computador do caixa</p>
      <a href="/downloads/impressao/instalador" download className={cn(buttonVariants({ variant: "outline" }), "h-11 self-start")}>
        <Download aria-hidden />
        Baixar o app (Windows)
      </a>
      <p className="text-sm text-muted-foreground">
        Se o Windows avisar, clique em <strong>Mais informações</strong> e <strong>Executar assim mesmo</strong>.
      </p>
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
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {dono && ativos.length === 0 ? <ComoInstalar /> : null}
        {computadores.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {computadores.map((c) => (
              <LinhaComputador key={c.id} computador={c} fuso={fuso} dono={dono} endereco={endereco} />
            ))}
          </ul>
        ) : null}
        {dono && ativos.length === 0 ? (
          <form key={estado?.chave} action={acao} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
              <span className="font-semibold">2. Conecte ao sistema</span>
              <span className="font-normal text-muted-foreground">Nome do computador</span>
              <Input name="nome" defaultValue={valorCampo(estado, "nome", "Notebook do caixa")} required className="h-11" />
              <ErroCampo estado={estado} campo="nome" />
            </label>
            <BotaoEnviar className="h-11" pendente="Gerando código...">
              Conectar computador
            </BotaoEnviar>
          </form>
        ) : null}
        {codigoEmUso(estado, computadores.map((c) => c.pareadoEm)) ? (
          <CodigoPareamento codigo={estado.codigo} expiraEm={estado.expiraEm} fuso={fuso} endereco={endereco} />
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
