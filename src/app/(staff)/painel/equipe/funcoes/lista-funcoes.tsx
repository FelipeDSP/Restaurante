"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, ErroCampo, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Permissao } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";

import { aplicarFuncaoEmPessoas, criarFuncao, excluirFuncao, salvarFuncao } from "../actions";
import { ChipsPermissoes } from "../permissoes-ui";

export type FuncaoComUso = { id: string; nome: string; permissoes: Permissao[]; pessoas: number };
export type PessoaDaEquipe = { id: string; nome: string; funcao: string; funcaoId: string | null };

const mesmas = (a: readonly Permissao[], b: readonly Permissao[]) => a.length === b.length && a.every((p) => b.includes(p));

export function NovaFuncao() {
  const [estado, acao] = useActionState(criarFuncao, undefined);
  useAvisoResultado(estado);
  const [aberto, setAberto] = useState(false);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) {
      setAberto(false);
      setPermissoes([]);
    }
  }
  if (!aberto) {
    return (
      <Button type="button" className="h-11 w-fit" onClick={() => setAberto(true)}>
        <Plus />
        Nova função
      </Button>
    );
  }
  return (
    <Card>
      <CardContent>
        <form key={estado?.chave} action={acao} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Input
              name="nome"
              aria-label="Nome da função"
              placeholder="Nome (ex.: Gerente)"
              defaultValue={valorCampo(estado, "nome", "")}
              maxLength={40}
              required
              className="h-11 max-w-sm"
            />
            <ErroCampo estado={estado} campo="nome" />
          </div>
          <ChipsPermissoes marcadas={permissoes} aoMudar={setPermissoes} />
          <div className="flex gap-2">
            <BotaoEnviar className="h-11" pendente="Criando...">
              Criar
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

function CartaoFuncao({ funcao, pessoas }: { funcao: FuncaoComUso; pessoas: PessoaDaEquipe[] }) {
  const [estado, acao] = useActionState(salvarFuncao.bind(null, funcao.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(funcao.nome);
  const [permissoes, setPermissoes] = useState(funcao.permissoes);
  const alterado = nome.trim() !== funcao.nome || !mesmas(permissoes, funcao.permissoes);

  return (
    <li className="rounded-xl border bg-background p-4">
      <form action={acao} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="nome"
            aria-label="Nome da função"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={40}
            required
            className="h-10 max-w-xs flex-1 font-medium"
          />
          <span className="text-sm text-muted-foreground">
            {funcao.pessoas === 0 ? "ninguém" : `${funcao.pessoas} ${funcao.pessoas === 1 ? "pessoa" : "pessoas"}`}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {alterado ? (
              <BotaoEnviar size="sm" pendente="...">
                Salvar
              </BotaoEnviar>
            ) : null}
            {funcao.pessoas === 0 ? (
              <BotaoConfirmar
                rotulo={`Excluir a função ${funcao.nome}`}
                confirmar="Confirmar: excluir"
                className="h-11 sm:h-9"
                desabilitado={pendente}
                aoConfirmar={() => executar(() => excluirFuncao(funcao.id))}
              >
                Excluir
              </BotaoConfirmar>
            ) : null}
          </div>
        </div>
        <ErroCampo estado={estado} campo="nome" />
        <ChipsPermissoes marcadas={permissoes} aoMudar={setPermissoes} />
      </form>
      <AplicarEmPessoas funcao={funcao} pessoas={pessoas} />
    </li>
  );
}

// Pessoa tem uma função só: aqui ela troca de função. Por isso a lista mostra só quem está em
// outra função, e a escolha começa vazia.
function AplicarEmPessoas({ funcao, pessoas }: { funcao: FuncaoComUso; pessoas: PessoaDaEquipe[] }) {
  const { pendente, executar } = useAcao();
  const [abrir, setAbrir] = useState(false);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const outras = pessoas.filter((p) => p.funcaoId !== funcao.id);

  if (outras.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t pt-3">
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setAbrir((a) => !a)}>
        {abrir ? "Fechar" : "Aplicar esta função em pessoas"}
      </Button>
      {abrir ? (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {outras.map((pessoa) => {
              const marcada = escolhidas.includes(pessoa.id);
              return (
                <li key={pessoa.id}>
                  <label
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors",
                      marcada ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={(e) =>
                        setEscolhidas((atual) => (e.target.checked ? [...atual, pessoa.id] : atual.filter((x) => x !== pessoa.id)))
                      }
                      className="size-5 pointer-coarse:size-6 accent-[var(--cor-primaria-texto)]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{pessoa.nome}</span>
                      <span className="truncate text-xs text-muted-foreground">{pessoa.funcao}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={pendente || escolhidas.length === 0}
            onClick={() =>
              executar(() => aplicarFuncaoEmPessoas(funcao.id, JSON.stringify(escolhidas)), () => {
                setEscolhidas([]);
                setAbrir(false);
              })
            }
          >
            {escolhidas.length === 0 ? "Escolha as pessoas" : `Aplicar em ${escolhidas.length}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ListaFuncoes({ funcoes, pessoas }: { funcoes: FuncaoComUso[]; pessoas: PessoaDaEquipe[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {funcoes.map((f) => (
        <CartaoFuncao key={f.id} funcao={f} pessoas={pessoas} />
      ))}
    </ul>
  );
}
