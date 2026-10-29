"use client";

import { Pencil, Printer } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, Campo, ErroCampo, marcadoCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { tempoDesde } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import { excluirImpressora, imprimirTeste, salvarImpressora } from "./actions";
import { AssistenteImpressora, impressorasEncontradas } from "./assistente";
import type { Computador, Impressao, Impressora } from "./dados";

type Pracas = { id: string; nome: string }[];

function FormImpressora({
  impressora,
  pracas,
  computadores,
  aoTerminar,
}: {
  impressora?: Impressora;
  pracas: Pracas;
  computadores: Computador[];
  aoTerminar?: () => void;
}) {
  const [estado, acao] = useActionState(salvarImpressora.bind(null, impressora?.id ?? null), undefined);
  useAvisoResultado(estado);
  // Salvou: fecha o formulário (o de "nova" volta ao botão).
  const fechar = useRef(aoTerminar);
  useEffect(() => {
    fechar.current = aoTerminar;
  });
  useEffect(() => {
    if (estado?.ok) fechar.current?.();
  }, [estado]);
  // Fora do <form>: sobrevivem à remontagem após erro.
  const [conexao, setConexao] = useState<Impressora["conexao"]>(impressora?.conexao ?? "rede");
  const [escolhidas, setEscolhidas] = useState<string[]>(impressora?.pracas ?? []);
  const nomesWindows = [...new Set(impressorasEncontradas(computadores).map((e) => e.nome))];
  const prefixo = impressora?.id ?? "nova";

  return (
    <form
      key={estado?.chave}
      action={acao}
      className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2"
    >
      <Campo rotulo="Nome" htmlFor={`${prefixo}-nome`}>
        <Input id={`${prefixo}-nome`} name="nome" placeholder="Ex.: Chapa, Caixa" defaultValue={valorCampo(estado, "nome", impressora?.nome)} required className="h-11" />
        <ErroCampo estado={estado} campo="nome" />
      </Campo>
      <Campo rotulo="Conexão" htmlFor={`${prefixo}-conexao`}>
        <Selecao id={`${prefixo}-conexao`} name="conexao" value={conexao} onChange={(e) => setConexao(e.target.value as Impressora["conexao"])} className="h-11">
          <option value="rede">Térmica pelo IP (rede, porta 9100)</option>
          <option value="windows">Instalada no Windows (USB, rede ou Wi-Fi)</option>
        </Selecao>
      </Campo>
      {conexao === "rede" ? (
        <>
          <Campo rotulo="IP da impressora" htmlFor={`${prefixo}-endereco`} dica="Aparece no teste que a própria impressora imprime ao ligar segurando o botão de avanço.">
            <Input
              id={`${prefixo}-endereco`}
              name="endereco"
              inputMode="decimal"
              placeholder="192.168.0.50"
              defaultValue={valorCampo(estado, "endereco", impressora?.conexao === "rede" ? impressora.endereco : "")}
              required
              className="h-11"
            />
            <ErroCampo estado={estado} campo="endereco" />
          </Campo>
          <Campo rotulo="Porta" htmlFor={`${prefixo}-porta`}>
            <Input id={`${prefixo}-porta`} name="porta" inputMode="numeric" defaultValue={valorCampo(estado, "porta", impressora?.porta ?? 9100)} className="h-11" />
          </Campo>
        </>
      ) : (
        <Campo
          rotulo="Nome no Windows"
          htmlFor={`${prefixo}-endereco`}
          className="sm:col-span-2"
          dica={nomesWindows.length > 0 ? "Escolha da lista que o app enviou ou digite." : "Conecte o computador para ver a lista das impressoras instaladas."}
        >
          <Input
            id={`${prefixo}-endereco`}
            name="endereco"
            list={`${prefixo}-windows`}
            placeholder="Ex.: ELGIN i9"
            defaultValue={valorCampo(estado, "endereco", impressora?.conexao === "windows" ? impressora.endereco : "")}
            required
            className="h-11"
          />
          <datalist id={`${prefixo}-windows`}>
            {nomesWindows.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input type="hidden" name="porta" value="9100" />
          <ErroCampo estado={estado} campo="endereco" />
        </Campo>
      )}
      {conexao === "windows" ? (
        <Campo
          rotulo="Como imprimir"
          htmlFor={`${prefixo}-modo`}
          className="sm:col-span-2"
          dica="Térmica: mais rápido, corta o papel. Driver: serve para qualquer impressora instalada no Windows."
        >
          <Selecao id={`${prefixo}-modo`} name="modo" defaultValue={valorCampo(estado, "modo", impressora?.modo ?? "escpos")} className="h-11">
            <option value="escpos">Comandos de impressora térmica (recomendado)</option>
            <option value="driver">Pelo driver do Windows (qualquer impressora)</option>
          </Selecao>
        </Campo>
      ) : null}
      <Campo rotulo="Papel" htmlFor={`${prefixo}-largura`} dica="Impressora comum (jato de tinta, laser): Folha A4, no modo pelo driver do Windows.">
        <Selecao id={`${prefixo}-largura`} name="largura" defaultValue={valorCampo(estado, "largura", impressora?.largura ?? 80)} className="h-11">
          <option value="80">Bobina 80 mm (padrão)</option>
          <option value="58">Bobina 58 mm (estreita)</option>
          <option value="210">Folha A4 (impressora comum)</option>
        </Selecao>
        <ErroCampo estado={estado} campo="largura" />
      </Campo>
      <Campo rotulo="Acentos" htmlFor={`${prefixo}-codificacao`} dica="Se os acentos saírem errados no teste, troque aqui.">
        <Selecao id={`${prefixo}-codificacao`} name="codificacao" defaultValue={valorCampo(estado, "codificacao", impressora?.codificacao ?? "cp850")} className="h-11">
          <option value="cp850">Padrão (PC850)</option>
          <option value="cp1252">Alternativo (Windows-1252)</option>
          <option value="sem_acentos">Sem acentos</option>
        </Selecao>
      </Campo>
      {computadores.filter((c) => c.situacao !== "desconectado").length > 1 ? (
        <Campo rotulo="Computador que imprime" htmlFor={`${prefixo}-agente`}>
          <Selecao id={`${prefixo}-agente`} name="agente_id" defaultValue={valorCampo(estado, "agente_id", impressora?.agenteId)} className="h-11">
            <option value="">Qualquer um</option>
            {computadores
              .filter((c) => c.situacao !== "desconectado")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Selecao>
        </Campo>
      ) : null}
      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">O que sai nesta impressora</legend>
        <input type="hidden" name="pracas" value={JSON.stringify(escolhidas)} />
        <div className="flex flex-wrap gap-2">
          {pracas.map((p) => {
            const marcada = escolhidas.includes(p.id);
            return (
              <label
                key={p.id}
                className={cn("flex h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm", marcada ? "border-primary bg-primary/5" : "bg-background")}
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={(e) => setEscolhidas((atual) => (e.target.checked ? [...atual, p.id] : atual.filter((x) => x !== p.id)))}
                  className="size-4 accent-[var(--cor-primaria-texto)]"
                />
                Pedidos da {p.nome}
              </label>
            );
          })}
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm">
            <input
              type="checkbox"
              name="imprime_conta"
              defaultChecked={marcadoCampo(estado, "imprime_conta", impressora?.imprimeConta ?? false)}
              className="size-4 accent-[var(--cor-primaria-texto)]"
            />
            Conta das mesas
          </label>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm">
            <input
              type="checkbox"
              name="imprime_via_delivery"
              defaultChecked={marcadoCampo(estado, "imprime_via_delivery", impressora?.imprimeViaDelivery ?? false)}
              className="size-4 accent-[var(--cor-primaria-texto)]"
            />
            Via do delivery (motoboy)
          </label>
        </div>
        {pracas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum setor da cozinha cadastrado.</p> : null}
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="ativa"
          defaultChecked={marcadoCampo(estado, "ativa", impressora?.ativa ?? true)}
          className="size-5 accent-[var(--cor-primaria-texto)]"
        />
        Ativa
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <BotaoEnviar className="h-11">{impressora ? "Salvar impressora" : "Cadastrar impressora"}</BotaoEnviar>
        {aoTerminar ? (
          <Button type="button" variant="ghost" className="h-11" onClick={aoTerminar}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function LinhaImpressora({
  impressora,
  pracas,
  computadores,
  dono,
}: {
  impressora: Impressora;
  pracas: Pracas;
  computadores: Computador[];
  dono: boolean;
}) {
  const { pendente, executar } = useAcao();
  const [editando, setEditando] = useState(false);
  const funcoes = [
    ...pracas.filter((p) => impressora.pracas.includes(p.id)).map((p) => p.nome),
    ...(impressora.imprimeConta ? ["Conta"] : []),
    ...(impressora.imprimeViaDelivery ? ["Via do delivery"] : []),
  ];
  const comErro = impressora.ultimoErroEm && (!impressora.ultimoSucessoEm || impressora.ultimoErroEm > impressora.ultimoSucessoEm);

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Printer className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-medium">{impressora.nome}</span>
        {!impressora.ativa ? <Badge variant="secondary">Inativa</Badge> : null}
        <span className="text-sm text-muted-foreground">
          {impressora.conexao === "rede" ? `Rede · ${impressora.endereco}:${impressora.porta}` : `Windows · ${impressora.endereco}`} · {impressora.largura === 210 ? "Folha A4" : `${impressora.largura} mm`}
          {impressora.modo === "driver" ? " · pelo driver" : ""}
        </span>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="outline" size="sm" disabled={pendente} onClick={() => executar(() => imprimirTeste(impressora.id))}>
            Testar
          </Button>
          {dono ? (
            <>
              <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${impressora.nome}`} onClick={() => setEditando((v) => !v)}>
                <Pencil />
              </Button>
              <BotaoConfirmar
                rotulo={`Excluir ${impressora.nome}`}
                desabilitado={pendente}
                aoConfirmar={() => executar(() => excluirImpressora(impressora.id))}
              />
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {funcoes.length > 0 ? (
          funcoes.map((f) => (
            <Badge key={f} variant="outline">
              {f}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-amber-800">Não imprime nada ainda: escolha as praças em Editar.</span>
        )}
      </div>
      {comErro ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900" suppressHydrationWarning>
          Último erro {tempoDesde(impressora.ultimoErroEm!)}: {impressora.ultimoErro}
        </p>
      ) : impressora.ultimoSucessoEm ? (
        <p className="text-sm text-green-800" suppressHydrationWarning>Imprimiu {tempoDesde(impressora.ultimoSucessoEm)}.</p>
      ) : null}
      {editando ? <FormImpressora impressora={impressora} pracas={pracas} computadores={computadores} aoTerminar={() => setEditando(false)} /> : null}
    </li>
  );
}

export function Impressoras({
  impressoras,
  pracas,
  computadores,
  fila,
  dono,
}: {
  impressoras: Impressora[];
  pracas: Pracas;
  computadores: Computador[];
  fila: Impressao[];
  dono: boolean;
}) {
  // Sem impressora: o assistente já aparece aberto. "avancado" = formulário completo (IP, nome digitado).
  const [nova, setNova] = useState<"assistente" | "avancado" | null>(impressoras.length === 0 ? "assistente" : null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Impressoras</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {impressoras.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {impressoras.map((i) => (
              <LinhaImpressora key={i.id} impressora={i} pracas={pracas} computadores={computadores} dono={dono} />
            ))}
          </ul>
        ) : !dono ? (
          <p className="text-muted-foreground">Nenhuma impressora cadastrada.</p>
        ) : null}
        {dono ? (
          nova === "assistente" ? (
            <>
              <AssistenteImpressora
                computadores={computadores}
                impressoras={impressoras}
                pracas={pracas}
                fila={fila}
                aoAvancado={() => setNova("avancado")}
                aoConcluir={() => setNova(null)}
              />
              {impressoras.length > 0 ? (
                <Button type="button" variant="ghost" className="w-fit" onClick={() => setNova(null)}>
                  Fechar
                </Button>
              ) : null}
            </>
          ) : nova === "avancado" ? (
            <FormImpressora pracas={pracas} computadores={computadores} aoTerminar={() => setNova(impressoras.length === 0 ? "assistente" : null)} />
          ) : (
            <Button type="button" variant="outline" className="w-fit" onClick={() => setNova("assistente")}>
              <Printer />
              Nova impressora
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
