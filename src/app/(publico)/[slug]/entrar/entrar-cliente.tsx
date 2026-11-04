"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { telefoneComPais } from "@/lib/telefone";
import { cn } from "@/lib/utils";

import { cadastrarCliente, concluirCadastro, entrarCliente, esqueciSenhaCliente, type ResultadoEntrar } from "./actions";

type Aba = "entrar" | "criar" | "esqueci" | "cadastro";

// (69) 99999-1234 enquanto digita.
function mascara(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {rotulo}
      {children}
    </label>
  );
}

function CampoSenha({ valor, aoMudar, novo }: { valor: string; aoMudar: (v: string) => void; novo?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        type={ver ? "text" : "password"}
        autoComplete={novo ? "new-password" : "current-password"}
        maxLength={72}
        className="h-12 pr-12 text-base"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Esconder a senha" : "Mostrar a senha"}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground"
      >
        {ver ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

type Props = {
  slug: string;
  nomeRestaurante: string;
  destino: string;
  // Já entrou com uma conta de outro restaurante e falta o cadastro neste.
  cadastro: { nomeSugerido: string; email: string | null } | null;
};

export function EntrarCliente({ slug, nomeRestaurante, destino, cadastro }: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(cadastro ? "cadastro" : "entrar");
  const [nome, setNome] = useState(cadastro?.nomeSugerido ?? "");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function executar(acao: () => Promise<ResultadoEntrar>, aoSucesso: (r: Extract<ResultadoEntrar, { ok: true }>) => void) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.ok) aoSucesso(r);
        else setErro(r.mensagem);
      } catch {
        setErro(mensagemFalhaRede());
      }
    });
  }

  function concluir() {
    router.replace(destino);
    router.refresh();
  }

  function trocar(nova: Aba) {
    setErro(null);
    setAviso(null);
    setAba(nova);
  }

  const mensagens = (
    <>
      {erro ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p role="status" className="text-sm font-medium text-green-700">
          {aviso}
        </p>
      ) : null}
    </>
  );
  const botaoPrincipal = "h-12 bg-[var(--cor-primaria)] text-base text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90";

  if (aba === "cadastro") {
    return (
      <form
        className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!telefoneComPais(celular)) return setErro("Informe o seu celular com DDD.");
          executar(() => concluirCadastro(slug, nome, celular), concluir);
        }}
      >
        <h1 className="text-xl font-bold">Falta pouco</h1>
        <p className="text-sm text-muted-foreground">
          {cadastro?.email ? <>Você entrou como <strong className="break-all text-foreground">{cadastro.email}</strong>. </> : null}
          Confirme seus dados para pedir no {nomeRestaurante}.
        </p>
        <Campo rotulo="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} className="h-12 text-base" />
        </Campo>
        <Campo rotulo="Celular (WhatsApp)">
          <Input
            value={celular}
            onChange={(e) => setCelular(mascara(e.target.value))}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(69) 99999-9999"
            className="h-12 text-base"
          />
        </Campo>
        {mensagens}
        <Button type="submit" className={botaoPrincipal} disabled={enviando}>
          {enviando ? "Salvando…" : "Continuar"}
        </Button>
      </form>
    );
  }

  if (aba === "esqueci") {
    return (
      <form
        className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          executar(
            () => esqueciSenhaCliente(slug, email),
            () => setAviso("Se houver uma conta com este e-mail, enviamos um link para escolher a senha nova. Confira também o spam."),
          );
        }}
      >
        <h1 className="text-xl font-bold">Esqueci minha senha</h1>
        <p className="text-sm text-muted-foreground">Enviamos um link para o seu e-mail para você escolher uma senha nova.</p>
        <Campo rotulo="E-mail">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" className="h-12 text-base" />
        </Campo>
        {mensagens}
        <Button type="submit" className={botaoPrincipal} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar link"}
        </Button>
        <button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={() => trocar("entrar")}>
          Voltar para entrar
        </button>
      </form>
    );
  }

  const criando = aba === "criar";
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm">
      <div role="tablist" aria-label="Entrar ou criar conta" className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["entrar", "criar"] as const).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={aba === a}
            onClick={() => trocar(a)}
            className={cn(
              "min-h-11 rounded-md text-sm font-semibold",
              aba === a ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {a === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (criando) {
            if (!telefoneComPais(celular)) return setErro("Informe o seu celular com DDD.");
            executar(() => cadastrarCliente(slug, { nome, email, celular, senha }), concluir);
          } else {
            executar(
              () => entrarCliente(slug, email, senha),
              (r) => {
                if (!r.precisaNome) return concluir();
                setNome(r.nomeSugerido ?? "");
                setAba("cadastro");
              },
            );
          }
        }}
      >
        {criando ? (
          <Campo rotulo="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={120} className="h-12 text-base" />
          </Campo>
        ) : null}
        <Campo rotulo="E-mail">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" className="h-12 text-base" />
        </Campo>
        {criando ? (
          <Campo rotulo="Celular (WhatsApp)">
            <Input
              value={celular}
              onChange={(e) => setCelular(mascara(e.target.value))}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(69) 99999-9999"
              className="h-12 text-base"
            />
          </Campo>
        ) : null}
        <Campo rotulo={criando ? "Crie uma senha (mínimo 8 caracteres)" : "Senha"}>
          <CampoSenha valor={senha} aoMudar={setSenha} novo={criando} />
        </Campo>
        {mensagens}
        <Button type="submit" className={botaoPrincipal} disabled={enviando}>
          {enviando ? (criando ? "Criando…" : "Entrando…") : criando ? "Criar conta" : "Entrar"}
        </Button>
        {criando ? null : (
          <button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={() => trocar("esqueci")}>
            Esqueci minha senha
          </button>
        )}
      </form>
      <p className="text-xs text-muted-foreground">
        A conta é opcional: dá para pedir sem entrar. Com ela, seus pedidos e endereços ficam salvos para o {nomeRestaurante}. Você pode
        excluir a conta quando quiser.
      </p>
    </div>
  );
}
