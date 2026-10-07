"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ControlesOrdem, useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  ativo: boolean;
  opcoes: Opcao[];
  produtos: { id: string; nome: string }[];
};

// Atalhos para os casos mais comuns.
const MODELOS = [
  { rotulo: "Escolha única obrigatória", exemplo: "ponto da carne, sabor", minimo: 1, maximo: 1 },
  { rotulo: "Escolha única opcional", exemplo: "tipo de pão", minimo: 0, maximo: 1 },
  { rotulo: "Vários opcionais", exemplo: "adicionais com preço", minimo: 0, maximo: 5 },
];

function CamposRegra({ estado, minimo, maximo, prefixo }: { estado: Parameters<typeof valorCampo>[0]; minimo: number; maximo: number; prefixo: string }) {
  const [regra, setRegra] = useState({ minimo: valorCampo(estado, "minimo", minimo), maximo: valorCampo(estado, "maximo", maximo) });
  const min = Number(regra.minimo);
  const max = Number(regra.maximo);
  const valida = Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= 1 && min <= max;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {MODELOS.map((m) => {
          const atual = min === m.minimo && max === m.maximo;
          return (
            <button
              key={m.rotulo}
              type="button"
              onClick={() => setRegra({ minimo: String(m.minimo), maximo: String(m.maximo) })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                atual ? "border-primary bg-primary/10" : "hover:bg-muted",
              )}
            >
              {m.rotulo} <span className="text-muted-foreground">({m.exemplo})</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Mínimo
          <Input
            id={`${prefixo}-minimo`}
            name="minimo"
            type="number"
            min={0}
            max={20}
            inputMode="numeric"
            value={regra.minimo}
            onChange={(e) => setRegra((r) => ({ ...r, minimo: e.target.value }))}
            className="h-10 w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Máximo
          <Input
            id={`${prefixo}-maximo`}
            name="maximo"
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            value={regra.maximo}
            onChange={(e) => setRegra((r) => ({ ...r, maximo: e.target.value }))}
            className="h-10 w-24"
          />
        </label>
        <p className="pb-2 text-sm text-muted-foreground">
          {valida ? `Cliente vê: "${min > 0 ? "Obrigatório · " : ""}${regraDoGrupo({ minimo: min, maximo: max })}"` : "Mínimo de 0 a 20; máximo de 1 a 20."}
        </p>
      </div>
      <ErroCampo estado={estado} campo="minimo" />
      <ErroCampo estado={estado} campo="maximo" />
    </div>
  );
}

export function NovoGrupo() {
  const [estado, acao] = useActionState(criarGrupo, undefined);
  useAvisoResultado(estado);
  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="novo-grupo" className="text-sm font-medium">
              Novo grupo
            </label>
            <Input
              id="novo-grupo"
              name="nome"
              placeholder="Ex.: Ponto da carne, Adicionais, Sabor"
              defaultValue={valorCampo(estado, "nome", "")}
              required
              className="h-11"
            />
            <ErroCampo estado={estado} campo="nome" />
          </div>
          <CamposRegra estado={estado} minimo={1} maximo={1} prefixo="novo" />
          <BotaoEnviar className="h-11 w-fit" pendente="Criando...">
            Criar grupo
          </BotaoEnviar>
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
        <Input name="nome" placeholder="Nova opção (ex.: Bacon)" aria-label="Nome da nova opção" defaultValue={valorCampo(estado, "nome", "")} required className="h-10" />
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

function CartaoGrupo({ grupo, primeiro, ultimo }: { grupo: Grupo; primeiro: boolean; ultimo: boolean }) {
  const [estado, acao] = useActionState(salvarGrupo.bind(null, grupo.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  return (
    <Card className={cn(!grupo.ativo && "opacity-75")}>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <ControlesOrdem
          rotulo={grupo.nome}
          primeiro={primeiro}
          ultimo={ultimo}
          desabilitado={pendente}
          aoMover={(direcao) => executar(() => moverGrupo(grupo.id, direcao))}
        />
        <h2 className="text-lg font-semibold">{grupo.nome}</h2>
        <Badge variant="outline">
          {grupo.minimo > 0 ? "Obrigatório · " : ""}
          {regraDoGrupo(grupo)}
        </Badge>
        {!grupo.ativo ? <Badge variant="secondary">Inativo</Badge> : null}
        <div className="ml-auto flex items-center gap-2">
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
            <Button type="button" variant="ghost" size="icon" aria-label={`Excluir grupo ${grupo.nome}`} onClick={() => setConfirmarExclusao(true)}>
              <Trash2 />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {confirmarExclusao ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Excluir apaga o grupo e as {grupo.opcoes.length} opções, e tira o grupo de {grupo.produtos.length}{" "}
            {grupo.produtos.length === 1 ? "produto" : "produtos"}. Pedidos já feitos não mudam. Para só esconder, use Desativar.
          </p>
        ) : null}

        <details className="group rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Editar nome e regra</summary>
          <form key={estado?.chave} action={acao} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`grupo-${grupo.id}-nome`} className="text-sm font-medium">
                Nome
              </label>
              <Input id={`grupo-${grupo.id}-nome`} name="nome" defaultValue={valorCampo(estado, "nome", grupo.nome)} required className="h-10" />
              <ErroCampo estado={estado} campo="nome" />
            </div>
            <CamposRegra estado={estado} minimo={grupo.minimo} maximo={grupo.maximo} prefixo={`grupo-${grupo.id}`} />
            <BotaoEnviar size="sm" className="w-fit">
              Salvar grupo
            </BotaoEnviar>
          </form>
        </details>

        <section aria-label={`Opções de ${grupo.nome}`} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Opções</h3>
          {grupo.opcoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma opção ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {grupo.opcoes.map((opcao, i) => (
                <LinhaOpcao key={opcao.id} opcao={opcao} grupoId={grupo.id} primeiro={i === 0} ultimo={i === grupo.opcoes.length - 1} />
              ))}
            </ul>
          )}
          <NovaOpcao grupoId={grupo.id} />
        </section>

        <p className="text-sm text-muted-foreground">
          {grupo.produtos.length === 0 ? (
            <>Ainda não está em nenhum produto. Ligue o grupo na tela do produto.</>
          ) : (
            <>
              Usado em:{" "}
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
        {grupo.minimo > 0 && grupo.opcoes.filter((o) => o.disponivel).length < grupo.minimo ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Este grupo é obrigatório, mas tem menos opções disponíveis que o mínimo: os produtos com ele não poderão ser pedidos.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ListaGrupos({ grupos }: { grupos: Grupo[] }) {
  if (grupos.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhum grupo ainda. Crie um acima (ex.: &quot;Ponto da carne&quot; com Mal passado, Ao ponto e Bem passado).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo, i) => (
        <CartaoGrupo key={grupo.id} grupo={grupo} primeiro={i === 0} ultimo={i === grupos.length - 1} />
      ))}
    </div>
  );
}
