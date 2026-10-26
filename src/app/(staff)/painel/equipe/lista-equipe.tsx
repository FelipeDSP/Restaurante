"use client";

import { ChevronDown, Copy, KeyRound, MessageCircle, SlidersHorizontal, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, Campo, ErroCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Permissao } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";

import { adicionarMembro, alternarMembro, atualizarMembro, redefinirSenha } from "./actions";
import { AjustePermissoes } from "./permissoes-ui";

export type Funcao = { id: string; nome: string; permissoes: Permissao[] };

export type Membro = {
  id: string;
  nome: string;
  // "dono" ou o id da função.
  funcao: string;
  extras: Permissao[];
  removidas: Permissao[];
  ativo: boolean;
  email: string | null;
  euMesmo: boolean;
};

function OpcoesFuncao({ funcoes }: { funcoes: Funcao[] }) {
  return (
    <>
      {funcoes.map((f) => (
        <option key={f.id} value={f.id}>
          {f.nome}
        </option>
      ))}
      <option value="dono">Dono (acesso a tudo)</option>
    </>
  );
}

const nomeDaFuncao = (funcoes: Funcao[], escolha: string) => (escolha === "dono" ? "Dono" : (funcoes.find((f) => f.id === escolha)?.nome ?? ""));

// Senha fácil de ditar ou digitar no celular (sem 0/O, 1/l/I).
function gerarSenha(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const sortear = (de: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => de[v % de.length]).join("");
  return `${sortear(letras, 4)}${sortear(numeros, 4)}`;
}

type AcessoCriado = { nome: string; email: string; senha: string; funcao: string; chaveAntes?: number };

// Depois de adicionar: o dono copia o acesso ou manda pelo WhatsApp (antes era anotar e repassar à mão).
function CartaoAcesso({
  acesso,
  enderecoLogin,
  restaurante,
  aoFechar,
}: {
  acesso: AcessoCriado;
  enderecoLogin: string;
  restaurante: string;
  aoFechar: () => void;
}) {
  const texto = [
    `Olá, ${acesso.nome}! Seu acesso ao sistema do ${restaurante} (${acesso.funcao}):`,
    `Endereço: ${enderecoLogin}`,
    `E-mail: ${acesso.email}`,
    acesso.senha ? `Senha: ${acesso.senha}` : "Senha: a mesma que você já usa.",
    `Esqueceu a senha? Toque em "Esqueci minha senha" na tela de entrada.`,
  ].join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Acesso copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o texto e copie.");
    }
  }

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border-2 border-green-600 bg-green-50 p-4 text-sm sm:col-span-2">
      <p className="font-semibold text-green-900">Acesso de {acesso.nome} pronto. Envie para a pessoa:</p>
      <pre className="rounded-lg bg-background p-3 font-sans whitespace-pre-wrap">{texto}</pre>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={copiar}>
          <Copy />
          Copiar
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "h-11")}
        >
          <MessageCircle />
          Enviar no WhatsApp
        </a>
        <Button type="button" variant="ghost" className="h-11" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

export function NovoMembro({
  habilitado,
  enderecoLogin,
  restaurante,
  funcoes,
}: {
  habilitado: boolean;
  enderecoLogin: string;
  restaurante: string;
  funcoes: Funcao[];
}) {
  const [estado, acao] = useActionState(adicionarMembro, undefined);
  useAvisoResultado(estado);
  const [senha, setSenha] = useState("");
  const [funcao, setFuncao] = useState(funcoes[0]?.id ?? "dono");
  const [enviado, setEnviado] = useState<AcessoCriado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  // Resultado novo: depois de adicionar, fecha o formulário e mostra o acesso para enviar.
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) {
      setSenha("");
      setAberto(false);
    }
  }
  // O cartão é do envio que acabou de dar certo (não de um resultado anterior).
  const criado = estado?.ok && enviado && estado.chave !== enviado.chaveAntes ? enviado : null;

  if (criado) {
    return <CartaoAcesso acesso={criado} enderecoLogin={enderecoLogin} restaurante={restaurante} aoFechar={() => setEnviado(null)} />;
  }
  if (!aberto) {
    return (
      <Button
        type="button"
        className="h-11 w-fit"
        disabled={!habilitado}
        onClick={() => {
          // Já vem com uma senha pronta: o dono só confere e envia.
          setSenha(gerarSenha());
          setAberto(true);
        }}
      >
        <UserPlus />
        Adicionar pessoa
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova pessoa</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          key={estado?.chave}
          action={(dados) => {
            setEnviado({
              nome: String(dados.get("nome") ?? "").trim(),
              email: String(dados.get("email") ?? "").trim().toLowerCase(),
              senha: String(dados.get("senha") ?? ""),
              funcao: nomeDaFuncao(funcoes, String(dados.get("funcao") ?? "")),
              chaveAntes: estado?.chave,
            });
            return acao(dados);
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <fieldset disabled={!habilitado} className="contents">
            <Campo rotulo="Nome" htmlFor="membro-nome">
              <Input id="membro-nome" name="nome" defaultValue={valorCampo(estado, "nome", "")} required className="h-11" />
              <ErroCampo estado={estado} campo="nome" />
            </Campo>
            <Campo rotulo="E-mail" htmlFor="membro-email">
              <Input id="membro-email" name="email" type="email" autoComplete="off" defaultValue={valorCampo(estado, "email", "")} required className="h-11" />
              <ErroCampo estado={estado} campo="email" />
            </Campo>
            <Campo rotulo="Função" htmlFor="membro-funcao">
              <Selecao id="membro-funcao" name="funcao" value={funcao} onChange={(e) => setFuncao(e.target.value)} className="h-11">
                <OpcoesFuncao funcoes={funcoes} />
              </Selecao>
              <ErroCampo estado={estado} campo="funcao" />
            </Campo>
            <Campo rotulo="Senha" htmlFor="membro-senha">
              <div className="flex gap-2">
                <Input
                  id="membro-senha"
                  name="senha"
                  type="text"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-11"
                />
                <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setSenha(gerarSenha())}>
                  Gerar
                </Button>
              </div>
              <ErroCampo estado={estado} campo="senha" />
            </Campo>
            <div className="flex gap-2 sm:col-span-2">
              <BotaoEnviar className="h-11" pendente="Adicionando...">
                Adicionar
              </BotaoEnviar>
              <Button type="button" variant="ghost" className="h-11" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

function TrocarSenha({ membro }: { membro: Membro }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao] = useActionState(redefinirSenha.bind(null, membro.id), undefined);
  useAvisoResultado(estado);

  if (!aberto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        <KeyRound />
        Nova senha
      </Button>
    );
  }
  return (
    <form action={acao} className="flex w-full flex-wrap items-center gap-2">
      <label htmlFor={`senha-${membro.id}`} className="sr-only">
        Nova senha de {membro.nome}
      </label>
      <Input
        id={`senha-${membro.id}`}
        name="senha"
        type="text"
        autoComplete="new-password"
        placeholder="Nova senha (mín. 8)"
        required
        minLength={8}
        className="h-10 max-w-60"
      />
      <BotaoEnviar size="sm" pendente="...">
        Definir
      </BotaoEnviar>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
      <ErroCampo estado={estado} campo="senha" />
    </form>
  );
}

const mesmas = (a: readonly Permissao[], b: readonly Permissao[]) => a.length === b.length && a.every((p) => b.includes(p));

function LinhaMembro({ membro, funcoes, contasHabilitadas }: { membro: Membro; funcoes: Funcao[]; contasHabilitadas: boolean }) {
  const [estado, acao] = useActionState(atualizarMembro.bind(null, membro.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(membro.nome);
  const [funcao, setFuncao] = useState(membro.funcao);
  const [extras, setExtras] = useState(membro.extras);
  const [removidas, setRemovidas] = useState(membro.removidas);
  const [ajustando, setAjustando] = useState(false);
  const daFuncao = funcoes.find((f) => f.id === funcao)?.permissoes ?? [];
  const ajustes = funcao === "dono" ? 0 : extras.filter((p) => !daFuncao.includes(p)).length + removidas.filter((p) => daFuncao.includes(p)).length;
  const alterado =
    nome !== membro.nome || funcao !== membro.funcao || !mesmas(extras, membro.extras) || !mesmas(removidas, membro.removidas);

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <form action={acao} className="flex flex-wrap items-center gap-2">
        <label htmlFor={`nome-${membro.id}`} className="sr-only">
          Nome
        </label>
        <Input
          id={`nome-${membro.id}`}
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="h-10 min-w-40 flex-1"
          required
        />
        <label htmlFor={`funcao-${membro.id}`} className="sr-only">
          Função
        </label>
        <Selecao
          id={`funcao-${membro.id}`}
          name="funcao"
          value={funcao}
          onChange={(e) => {
            // Outra função: os ajustes eram sobre a anterior.
            setFuncao(e.target.value);
            setExtras(e.target.value === membro.funcao ? membro.extras : []);
            setRemovidas(e.target.value === membro.funcao ? membro.removidas : []);
          }}
          disabled={membro.euMesmo}
          className="w-44"
        >
          <OpcoesFuncao funcoes={funcoes} />
        </Selecao>
        {/* select desabilitado não é enviado: repete a função atual. */}
        {membro.euMesmo ? <input type="hidden" name="funcao" value={membro.funcao} /> : null}
        {funcao !== "dono" ? (
          <Button type="button" variant="ghost" size="sm" aria-expanded={ajustando} onClick={() => setAjustando((a) => !a)}>
            <SlidersHorizontal />
            {ajustes ? `Permissões (${ajustes} ${ajustes === 1 ? "ajuste" : "ajustes"})` : "Permissões"}
            <ChevronDown className={ajustando ? "rotate-180" : undefined} />
          </Button>
        ) : null}
        {alterado ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
        {funcao !== "dono" ? (
          <div className={ajustando ? "basis-full rounded-lg bg-muted/40 p-3" : "hidden"}>
            <AjustePermissoes
              daFuncao={daFuncao}
              extras={extras}
              removidas={removidas}
              aoMudar={(e, r) => {
                setExtras(e);
                setRemovidas(r);
              }}
            />
          </div>
        ) : null}
        <ErroCampo estado={estado} campo="funcao" />
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{membro.email ?? "e-mail indisponível"}</span>
        {membro.euMesmo ? <Badge variant="outline">Você</Badge> : null}
        {!membro.ativo ? <Badge variant="secondary">Sem acesso</Badge> : null}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {contasHabilitadas ? <TrocarSenha membro={membro} /> : null}
          {!membro.euMesmo && membro.ativo ? (
            <BotaoConfirmar
              rotulo={`Desativar acesso de ${membro.nome}`}
              confirmar="Confirmar: desativar"
              icone={false}
              className="h-11 sm:h-9"
              desabilitado={pendente}
              aoConfirmar={() => executar(() => alternarMembro(membro.id, false))}
            >
              Desativar acesso
            </BotaoConfirmar>
          ) : null}
          {!membro.euMesmo && !membro.ativo ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              disabled={pendente}
              onClick={() => executar(() => alternarMembro(membro.id, true))}
            >
              Reativar acesso
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ListaEquipe({ membros, funcoes, contasHabilitadas }: { membros: Membro[]; funcoes: Funcao[]; contasHabilitadas: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {membros.map((membro) => (
        <LinhaMembro key={membro.id} membro={membro} funcoes={funcoes} contasHabilitadas={contasHabilitadas} />
      ))}
    </ul>
  );
}
