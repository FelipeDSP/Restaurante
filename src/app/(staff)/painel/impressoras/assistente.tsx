"use client";

import { Check, FileText, Loader2, Printer, ReceiptText } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { ajustarPeloTeste, configurarImpressora } from "./actions";
import type { Computador, Impressao, Impressora } from "./dados";

type Pracas = { id: string; nome: string }[];
type Tipo = "cupom80" | "cupom58" | "comum";

// Impressoras que o Windows lista mas não servem para ticket (fax, PDF, acesso remoto...).
const VIRTUAL =
  /fax|pdf|xps|onenote|rustdesk|anydesk|teamviewer|send to|enviar para|microsoft print|document writer|snagit|cutepdf|foxit|nitro|bullzip/i;
// Palpite pelo nome; a pessoa sempre confirma.
const TERMICA =
  /\btm[-\s]?|elgin|bematech|daruma|sweda|tanca|xprinter|gertec|control ?id|epson tm|mp-?\d|i[789]\b|pos[-\s]?\d|t[ée]rmica|thermal|58\s?mm|80\s?mm|receipt|kp-?\d|zj-?\d|generic.*text/i;
const COMUM =
  /smart ?tank|laserjet|deskjet|officejet|envy|brother|canon|pixma|ecotank|\bepson l\d|\bl\d{3,4}\b|ink|laser|dcp|mfc|samsung|xerox|ricoh|lexmark|kyocera/i;

export function impressorasEncontradas(computadores: Computador[]) {
  return computadores
    .filter((c) => c.situacao !== "desconectado")
    .flatMap((c) =>
      c.impressorasWindows
        .filter((n) => !VIRTUAL.test(n))
        .map((nome) => ({ nome, computador: c })),
    );
}

function palpite(nome: string): Tipo | null {
  if (TERMICA.test(nome)) return "cupom80";
  if (COMUM.test(nome)) return "comum";
  return null;
}

// Passo a passo: escolhe a impressora encontrada -> diz o tipo -> o teste sai sozinho.
export function AssistenteImpressora({
  computadores,
  impressoras,
  pracas,
  fila,
  aoAvancado,
  aoConcluir,
}: {
  computadores: Computador[];
  impressoras: Impressora[];
  pracas: Pracas;
  fila: Impressao[];
  aoAvancado: () => void;
  aoConcluir: () => void;
}) {
  const encontradas = impressorasEncontradas(computadores);
  const usadas = new Set(
    impressoras.filter((i) => i.conexao === "windows").map((i) => i.endereco),
  );
  const variosComputadores =
    new Set(encontradas.map((e) => e.computador.id)).size > 1;
  const primeira = impressoras.length === 0;

  const [escolhida, setEscolhida] = useState<{
    nome: string;
    agenteId: string;
  } | null>(null);
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [nome, setNome] = useState("");
  // A primeira impressora já imprime tudo; as outras a pessoa escolhe.
  const [conta, setConta] = useState(primeira);
  const [via, setVia] = useState(primeira);
  const [aoFechar, setAoFechar] = useState(false);
  const [setores, setSetores] = useState<string[]>(
    primeira ? pracas.map((p) => p.id) : [],
  );
  const [testando, setTestando] = useState<{ id: string; nome: string } | null>(
    null,
  );
  const { pendente, executar } = useAcao();

  const escolher = (n: string, agenteId: string) => {
    setEscolhida({ nome: n, agenteId });
    setTipo(palpite(n));
    setNome(primeira ? "Caixa" : n.replace(/\s*\(.*\)\s*$/, "").slice(0, 60));
  };

  if (testando) {
    // A fila vem do servidor (tempo real): o teste mais recente desta impressora.
    const teste = fila.find(
      (f) => f.tipo === "teste" && f.impressora === testando.nome,
    );
    const saiu = teste?.status === "impresso";
    const erro = teste?.status === "erro" ? teste.erro : null;
    return (
      <div className="flex flex-col gap-3 rounded-xl border-2 border-[var(--cor-primaria)] p-4">
        <p className="flex items-center gap-2 font-semibold">
          {saiu ? (
            <Check className="size-5 text-green-700" aria-hidden />
          ) : erro ? null : (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          )}
          {saiu
            ? `O teste saiu na ${testando.nome}?`
            : erro
              ? "O teste não foi impresso."
              : `Mandando um teste para a ${testando.nome}...`}
        </p>
        {erro ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
            {erro}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11"
            disabled={pendente}
            onClick={() => {
              setTestando(null);
              aoConcluir();
            }}
          >
            <Check />
            Saiu certinho
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pendente}
            onClick={() =>
              executar(() => ajustarPeloTeste(testando.id, "nada"))
            }
          >
            Não saiu nada
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pendente}
            onClick={() =>
              executar(() => ajustarPeloTeste(testando.id, "letras"))
            }
          >
            Saiu com letras estranhas
          </Button>
        </div>
      </div>
    );
  }

  if (encontradas.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
        <p className="font-medium">
          Nenhuma impressora encontrada no computador do caixa.
        </p>
        <p className="text-sm text-muted-foreground">
          Instale a impressora no Windows e deixe o app de impressão aberto: ela
          aparece aqui sozinha em alguns segundos.
        </p>
        <Button
          type="button"
          variant="link"
          className="h-auto w-fit p-0"
          onClick={aoAvancado}
        >
          Cadastrar pelo IP ou digitando o nome
        </Button>
      </div>
    );
  }

  if (!escolhida) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-medium">
          Qual destas é a impressora do restaurante?
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {encontradas.map((e) => {
            const jaUsada = usadas.has(e.nome);
            return (
              <li key={`${e.computador.id}-${e.nome}`}>
                <button
                  type="button"
                  disabled={jaUsada}
                  onClick={() => escolher(e.nome, e.computador.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background p-3 text-left hover:border-[var(--cor-primaria)] disabled:opacity-50"
                >
                  <Printer
                    className="size-6 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{e.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {jaUsada
                        ? "Já cadastrada"
                        : variosComputadores
                          ? e.computador.nome
                          : "Toque para usar"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="link"
          className="h-auto w-fit p-0 text-muted-foreground"
          onClick={aoAvancado}
        >
          Não está na lista
        </Button>
      </div>
    );
  }

  const opcao = (
    valor: Tipo,
    Icone: typeof ReceiptText,
    titulo: string,
    texto: string,
  ) => (
    <button
      type="button"
      aria-pressed={
        tipo === valor || (valor === "cupom80" && tipo === "cupom58")
      }
      onClick={() => setTipo(valor)}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 text-center",
        tipo === valor || (valor === "cupom80" && tipo === "cupom58")
          ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)]/5"
          : "bg-background",
      )}
    >
      <Icone className="size-10" aria-hidden />
      <span className="font-semibold">{titulo}</span>
      <span className="text-xs text-muted-foreground">{texto}</span>
    </button>
  );

  const chip = (
    marcado: boolean,
    rotulo: string,
    aoMudar: (v: boolean) => void,
    chave: string,
  ) => (
    <label
      key={chave}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm",
        marcado ? "border-primary bg-primary/5" : "bg-background",
      )}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="size-4 accent-[var(--cor-primaria-texto)]"
      />
      {rotulo}
    </label>
  );

  const nadaMarcado = !conta && !via && !aoFechar && setores.length === 0;

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-medium">{escolhida.nome}</p>
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          onClick={() => setEscolhida(null)}
        >
          Trocar
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Que tipo de impressora é?</p>
        <div className="flex gap-2">
          {opcao(
            "cupom80",
            ReceiptText,
            "De cupom",
            "Bobina de papel, como a de maquininha",
          )}
          {opcao(
            "comum",
            FileText,
            "Comum",
            "Folha A4, jato de tinta ou laser",
          )}
        </div>
        {tipo === "cupom80" || tipo === "cupom58" ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={tipo === "cupom58"}
              onChange={(e) =>
                setTipo(e.target.checked ? "cupom58" : "cupom80")
              }
              className="size-4"
            />
            Bobina estreita (58 mm)
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">O que sai nela</p>
        <div className="flex flex-wrap gap-2">
          {chip(conta, "Conta das mesas", setConta, "conta")}
          {chip(via, "Via do delivery", setVia, "via")}
          {chip(aoFechar, "Via do cliente ao fechar a mesa", setAoFechar, "fechar")}
          {pracas.map((p) =>
            chip(
              setores.includes(p.id),
              `Pedidos da ${p.nome}`,
              (v) =>
                setSetores((s) =>
                  v ? [...s, p.id] : s.filter((x) => x !== p.id),
                ),
              p.id,
            ),
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium sm:max-w-xs">
        Nome no sistema
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={60}
          className="h-11"
        />
      </label>

      <Button
        type="button"
        className="h-12 sm:w-fit"
        disabled={pendente || !tipo || !nome.trim() || nadaMarcado}
        onClick={() =>
          executar(async () => {
            const r = await configurarImpressora({
              agenteId: escolhida.agenteId,
              nomeWindows: escolhida.nome,
              tipo: tipo!,
              nome: nome.trim(),
              imprimeConta: conta,
              imprimeViaDelivery: via,
              imprimeAoFechar: aoFechar,
              pracas: setores,
            });
            if (r.ok && r.impressoraId) {
              setTestando({ id: r.impressoraId, nome: nome.trim() });
              setEscolhida(null);
            }
            return r;
          })
        }
      >
        <Printer />
        {pendente ? "Configurando..." : "Usar e imprimir teste"}
      </Button>
    </div>
  );
}
