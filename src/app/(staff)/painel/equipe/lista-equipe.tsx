"use client";

import { Copy, KeyRound, MessageCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";

import { useAcao } from "@/components/staff/acoes-cliente";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";
import { BotaoEnviar, Campo, ErroCampo, Selecao, useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NOME_PAPEL, PAPEIS, type Papel } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";

import { adicionarMembro, alternarMembro, atualizarMembro, redefinirSenha } from "./actions";

export type Membro = {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  email: string | null;
  euMesmo: boolean;
};

function OpcoesPapel() {
  return PAPEIS.map((p) => (
    <option key={p} value={p}>
      {NOME_PAPEL[p]}
    </option>
  ));
}

// Senha fácil de ditar ou digitar no celular (sem 0/O, 1/l/I).
function gerarSenha(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  const sortear = (de: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => de[v % de.length]).join("");
  return `${sortear(letras, 4)}${sortear(numeros, 4)}`;
}

type AcessoCriado = { nome: string; email: string; senha: string; papel: Papel; chaveAntes?: number };

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
    `Olá, ${acesso.nome}! Seu acesso ao sistema do ${restaurante} (${NOME_PAPEL[acesso.papel]}):`,
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
}: {
  habilitado: boolean;
  enderecoLogin: string;
  restaurante: string;
}) {
  const [estado, acao] = useActionState(adicionarMembro, undefined);
  useAvisoResultado(estado);
  const [senha, setSenha] = useState("");
  const [enviado, setEnviado] = useState<AcessoCriado | null>(null);
  const [chaveVista, setChaveVista] = useState(estado?.chave);
  // Resultado novo: depois de adicionar, limpa a senha para o próximo cadastro.
  if (estado?.chave !== chaveVista) {
    setChaveVista(estado?.chave);
    if (estado?.ok) setSenha("");
  }
  // O cartão é do envio que acabou de dar certo (não de um resultado anterior).
  const criado = estado?.ok && enviado && estado.chave !== enviado.chaveAntes ? enviado : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar à equipe</CardTitle>
      </CardHeader>
      <CardContent>
        {criado ? (
          <div className="mb-4 grid">
            <CartaoAcesso acesso={criado} enderecoLogin={enderecoLogin} restaurante={restaurante} aoFechar={() => setEnviado(null)} />
          </div>
        ) : null}
        <form
          key={estado?.chave}
          action={(dados) => {
            setEnviado({
              nome: String(dados.get("nome") ?? "").trim(),
              email: String(dados.get("email") ?? "").trim().toLowerCase(),
              senha: String(dados.get("senha") ?? ""),
              papel: String(dados.get("papel") ?? "garcom") as Papel,
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
            <Campo rotulo="Papel" htmlFor="membro-papel">
              <Selecao id="membro-papel" name="papel" defaultValue={valorCampo(estado, "papel", "garcom")} className="h-11">
                <OpcoesPapel />
              </Selecao>
            </Campo>
            <Campo
              rotulo="Senha inicial"
              htmlFor="membro-senha"
              dica="Mínimo de 8 caracteres. Se a pessoa já tiver conta, a senha dela é mantida."
            >
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
            <div className="sm:col-span-2">
              <BotaoEnviar className="h-11" pendente="Adicionando...">
                Adicionar
              </BotaoEnviar>
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

function LinhaMembro({ membro, contasHabilitadas }: { membro: Membro; contasHabilitadas: boolean }) {
  const [estado, acao] = useActionState(atualizarMembro.bind(null, membro.id), undefined);
  useAvisoResultado(estado);
  const { pendente, executar } = useAcao();
  const [nome, setNome] = useState(membro.nome);
  const [papel, setPapel] = useState<Papel>(membro.papel);
  const alterado = nome !== membro.nome || papel !== membro.papel;

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
        <label htmlFor={`papel-${membro.id}`} className="sr-only">
          Papel
        </label>
        <Selecao
          id={`papel-${membro.id}`}
          name="papel"
          value={papel}
          onChange={(e) => setPapel(e.target.value as Papel)}
          disabled={membro.euMesmo}
          className="w-36"
        >
          <OpcoesPapel />
        </Selecao>
        {/* select desabilitado não é enviado: repete o papel atual. */}
        {membro.euMesmo ? <input type="hidden" name="papel" value={membro.papel} /> : null}
        {alterado ? (
          <BotaoEnviar size="sm" pendente="...">
            Salvar
          </BotaoEnviar>
        ) : null}
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

export function ListaEquipe({ membros, contasHabilitadas }: { membros: Membro[]; contasHabilitadas: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {membros.map((membro) => (
        <LinhaMembro key={membro.id} membro={membro} contasHabilitadas={contasHabilitadas} />
      ))}
    </ul>
  );
}
