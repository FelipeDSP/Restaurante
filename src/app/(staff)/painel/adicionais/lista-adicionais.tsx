"use client";

import { ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { regraDoGrupo } from "@/lib/adicionais";
import { textoDeCentavos } from "@/lib/dinheiro";
import { cn } from "@/lib/utils";

import {
  alternarGrupo,
  alternarOpcao,
  criarGrupo,
  criarOpcao,
  excluirGrupo,
  excluirOpcao,
  moverGrupo,
  moverOpcao,
  salvarGrupo,
  salvarOpcao,
} from "./actions";

export type Opcao = { id: string; nome: string; preco: number; disponivel: boolean };
export type Grupo = {
  id: string;
  nome: string;
  minimo: number;
  maximo: number;
  repetir: boolean;
  ativo: boolean;
  opcoes: Opcao[];
  produtos: { id: string; nome: string }[];
};

// Os três jeitos mais comuns; qualquer outro mínimo/máximo fica em "Personalizar".
const MODELOS = [
  { rotulo: "Obrigatório, escolhe 1", minimo: 1, maximo: 1 },
  { rotulo: "Opcional, escolhe 1", minimo: 0, maximo: 1 },
  { rotulo: "Opcional, escolhe vários", minimo: 0, maximo: 5 },
];

function modeloDe(min: number, max: number) {
  if (min === 1 && max === 1) return 0;
  if (min === 0 && max === 1) return 1;
  if (min === 0 && max > 1) return 2;
  return null;
}

function CamposRegra({
  estado,
  minimo,
  maximo,
  repetir,
  prefixo,
}: {
  estado: Parameters<typeof valorCampo>[0];
  minimo: number;
  maximo: number;
  repetir: boolean;
  prefixo: string;
}) {
  const [regra, setRegra] = useState({ minimo: valorCampo(estado, "minimo", minimo), maximo: valorCampo(estado, "maximo", maximo) });
  const modelo = modeloDe(Number(regra.minimo), Number(regra.maximo));
  const repetirInicial = estado?.valores ? estado.valores.repetir === "on" : repetir;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="minimo" value={regra.minimo} />
      <input type="hidden" name="maximo" value={regra.maximo} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Como o cliente escolhe">
        {MODELOS.map((m, i) => (
          <button
            key={m.rotulo}
            type="button"
            aria-pressed={modelo === i}
            onClick={() => setRegra({ minimo: String(m.minimo), maximo: String(m.maximo) })}
            className={cn(
              "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors",
              modelo === i ? "border-primary bg-primary/10" : "hover:bg-muted",
            )}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      {modelo === 2 ? (
        <label className="flex items-center gap-2 text-sm font-medium">
          Até
          <Input
            id={`${prefixo}-ate`}
            type="number"
            min={2}
            max={20}
            inputMode="numeric"
            value={regra.maximo}
            onChange={(e) => setRegra((r) => ({ ...r, maximo: e.target.value }))}
            className="h-10 w-20"
          />
          opções
        </label>
      ) : null}
      <details className="text-sm" open={modelo === null || repetirInicial}>
        <summary className="w-fit cursor-pointer text-muted-foreground">Personalizar</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-medium">
              Escolhe no mínimo
              <Input
                id={`${prefixo}-minimo`}
                type="number"
                min={0}
                max={20}
                inputMode="numeric"
                value={regra.minimo}
                onChange={(e) => setRegra((r) => ({ ...r, minimo: e.target.value }))}
                className="h-10 w-24"
              />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              No máximo
              <Input
                id={`${prefixo}-maximo`}
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={regra.maximo}
                onChange={(e) => setRegra((r) => ({ ...r, maximo: e.target.value }))}
                className="h-10 w-24"
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="repetir" defaultChecked={repetirInicial} className="size-5 accent-[var(--cor-primaria-texto)]" />
            <span className="font-medium">Pode repetir a mesma opção (ex.: 2x bacon)</span>
          </label>
        </div>
      </details>
      <ErroCampo estado={estado} campo="minimo" />
      <ErroCampo estado={estado} campo="maximo" />
    </div>
  );
}

export function NovoGrupo() {
  const [estado, acao] = useActionState(criarGrupo, undefined);
  useAvisoResultado(estado);
  const [aberto, setAberto] = useState(false);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  // Criou: fecha o formulário (o grupo novo aparece na lista).
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) setAberto(false);
  }

  if (!aberto) {
    return (
      <Button type="button" className="h-11 w-fit" onClick={() => setAberto(true)}>
        <Plus />
        Novo grupo
      </Button>
    );
  }
  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="novo-grupo" className="text-sm font-medium">
              Nome do grupo
            </label>
            <Input
              id="novo-grupo"
              name="nome"
              placeholder="Ex.: Ponto da carne"
              defaultValue={valorCampo(estado, "nome", "")}
              required
              autoFocus
              className="h-11"
            />
            <ErroCampo estado={estado} campo="nome" />
          </div>
          <CamposRegra estado={estado} minimo={1} maximo={1} repetir={false} prefixo="novo" />
          <div className="flex gap-2">
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar grupo
            </BotaoEnviar>
            <Button type="button" variant="ghost" className="h-11" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LinhaOpcao({ opcao, grupoId, primeiro, ultimo }: { opcao: Opcao; grupoId: string; primeiro: boolean; ultimo: boolean }) {
  const [estado, acao] = useActionState(salvarOpcao.bind(null, opcao.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(opcao.nome);
  const [preco, setPreco] = useState(opcao.preco ? textoDeCentavos(opcao.preco) : "");
  const mudou = nome !== opcao.nome || preco !== (opcao.preco ? textoDeCentavos(opcao.preco) : "");

  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center", !opcao.disponivel && "bg-muted/50")}>
      <ControlesOrdem
        rotulo={opcao.nome}
        primeiro={primeiro}
        ultimo={ultimo}
        desabilitado={pendente}
        aoMover={(direcao) => executar(() => moverOpcao(opcao.id, grupoId, direcao))}
      />
      <form action={acao} className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome da opção"
          required
          className="h-10 min-w-40 flex-1"
        />
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">+ R$</span>
          <Input
            name="preco"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-label={`Preço de ${opcao.nome}`}
            className="h-10 w-28 pl-11"
          />
        </div>
        {mudou ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
        <ErroCampo estado={estado} campo="nome" />
        <ErroCampo estado={estado} campo="preco" />
      </form>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={opcao.disponivel}
            disabled={pendente}
            onChange={(e) => executar(() => alternarOpcao(opcao.id, e.target.checked))}
            className="size-5 accent-[var(--cor-primaria-texto)]"
          />
          Disponível
        </label>
        <BotaoConfirmar
          rotulo={`Excluir ${opcao.nome}`}
          desabilitado={pendente}
          aoConfirmar={() => executar(() => excluirOpcao(opcao.id))}
        />
      </div>
    </li>
  );
}

function NovaOpcao({ grupoId }: { grupoId: string }) {
  const [estado, acao] = useActionState(criarOpcao.bind(null, grupoId), undefined);
  useAvisoResultado(estado);
  return (
    <form key={estado?.chave} action={acao} className="flex flex-wrap items-start gap-2">
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <Input name="nome" placeholder="Nova opção" aria-label="Nome da nova opção" defaultValue={valorCampo(estado, "nome", "")} required className="h-10" />
        <ErroCampo estado={estado} campo="nome" />
      </div>
      <div className="flex flex-col gap-1">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">+ R$</span>
          <Input
            name="preco"
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Preço da nova opção"
            defaultValue={valorCampo(estado, "preco", "")}
            className="h-10 w-28 pl-11"
          />
        </div>
        <ErroCampo estado={estado} campo="preco" />
      </div>
      <BotaoEnviar className="h-10" variant="outline" pendente="...">
        <Plus />
        Adicionar
      </BotaoEnviar>
    </form>
  );
}

// Fechado mostra só o resumo (nome, regra e opções); aberto mostra as opções para editar.
function CartaoGrupo({ grupo, primeiro, ultimo }: { grupo: Grupo; primeiro: boolean; ultimo: boolean }) {
  const [estado, acao] = useActionState(salvarGrupo.bind(null, grupo.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const faltamOpcoes = grupo.minimo > 0 && grupo.opcoes.filter((o) => o.disponivel).length < grupo.minimo;

  return (
    <details className={cn("group rounded-xl border bg-card", !grupo.ativo && "opacity-75")}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{grupo.nome}</span>
            <Badge variant="outline">
              {grupo.minimo > 0 ? "Obrigatório · " : ""}
              {regraDoGrupo(grupo)}
            </Badge>
            {!grupo.ativo ? <Badge variant="secondary">Inativo</Badge> : null}
            {faltamOpcoes ? <Badge variant="destructive">Faltam opções</Badge> : null}
          </span>
          <span className="line-clamp-1 text-sm text-muted-foreground">
            {grupo.opcoes.length > 0 ? grupo.opcoes.map((o) => o.nome).join(", ") : "Sem opções"}
          </span>
        </span>
        <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">
          {grupo.produtos.length} {grupo.produtos.length === 1 ? "produto" : "produtos"}
        </span>
      </summary>

      <div className="flex flex-col gap-5 border-t p-4">
        <section aria-label={`Opções de ${grupo.nome}`} className="flex flex-col gap-2">
          {grupo.opcoes.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {grupo.opcoes.map((opcao, i) => (
                <LinhaOpcao key={opcao.id} opcao={opcao} grupoId={grupo.id} primeiro={i === 0} ultimo={i === grupo.opcoes.length - 1} />
              ))}
            </ul>
          ) : null}
          <NovaOpcao grupoId={grupo.id} />
        </section>

        {faltamOpcoes ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            É obrigatório, mas não tem opções disponíveis suficientes: os produtos com ele não podem ser pedidos.
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {grupo.produtos.length === 0 ? (
            <>Ainda não está em nenhum produto.</>
          ) : (
            <>
              Em:{" "}
              {grupo.produtos.map((p, i) => (
                <span key={p.id}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/painel/produtos/${p.id}`} className="underline underline-offset-4">
                    {p.nome}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>

        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Nome, regra e posição</summary>
          <form key={estado?.chave} action={acao} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`grupo-${grupo.id}-nome`} className="text-sm font-medium">
                Nome
              </label>
              <Input id={`grupo-${grupo.id}-nome`} name="nome" defaultValue={valorCampo(estado, "nome", grupo.nome)} required className="h-10" />
              <ErroCampo estado={estado} campo="nome" />
            </div>
            <CamposRegra estado={estado} minimo={grupo.minimo} maximo={grupo.maximo} repetir={grupo.repetir} prefixo={`grupo-${grupo.id}`} />
            <BotaoEnviar size="sm" className="w-fit">
              Salvar grupo
            </BotaoEnviar>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-sm text-muted-foreground">Posição</span>
            <ControlesOrdem
              rotulo={grupo.nome}
              primeiro={primeiro}
              ultimo={ultimo}
              desabilitado={pendente}
              aoMover={(direcao) => executar(() => moverGrupo(grupo.id, direcao))}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pendente}
                onClick={() => executar(() => alternarGrupo(grupo.id, !grupo.ativo))}
              >
                {grupo.ativo ? "Desativar" : "Ativar"}
              </Button>
              {confirmarExclusao ? (
                <>
                  <Button type="button" variant="destructive" size="sm" disabled={pendente} onClick={() => executar(() => excluirGrupo(grupo.id))}>
                    Confirmar exclusão
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmarExclusao(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmarExclusao(true)}>
                  <Trash2 />
                  Excluir
                </Button>
              )}
            </div>
          </div>
          {confirmarExclusao ? (
            <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              Apaga o grupo e as {grupo.opcoes.length} opções e tira de {grupo.produtos.length}{" "}
              {grupo.produtos.length === 1 ? "produto" : "produtos"}. Pedidos já feitos não mudam.
            </p>
          ) : null}
        </details>
      </div>
    </details>
  );
}

export function ListaGrupos({ grupos }: { grupos: Grupo[] }) {
  if (grupos.length === 0) {
    return (
      <p className="text-muted-foreground">Nenhum grupo ainda.</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {grupos.map((grupo, i) => (
        <CartaoGrupo key={grupo.id} grupo={grupo} primeiro={i === 0} ultimo={i === grupos.length - 1} />
      ))}
    </div>
  );
}
