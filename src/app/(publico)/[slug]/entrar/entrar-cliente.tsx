"use client";

import { Mail, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { AntiRobo } from "@/components/anti-robo";
import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarTelefone, telefoneComPais } from "@/lib/telefone";

import {
  concluirCadastro,
  confirmarCodigo,
  confirmarCodigoEmail,
  entrarComGoogle,
  pedirCodigo,
  pedirCodigoEmail,
  type ResultadoEntrar,
} from "./actions";

type Etapa = "inicio" | "telefone" | "codigo" | "cadastro";
type Canal = "email" | "sms";
type Formas = { email: true; google: boolean; sms: boolean };

const ESPERA_REENVIO_S = 60;

// (69) 99999-1234 enquanto digita.
function mascara(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

type Props = {
  slug: string;
  nomeRestaurante: string;
  destino: string;
  formas: Formas;
  // Já entrou (voltou do Google, por exemplo) e falta o cadastro neste restaurante.
  cadastro: { nomeSugerido: string; precisaTelefone: boolean; email: string | null } | null;
  erroInicial: string | null;
};

export function EntrarCliente({ slug, nomeRestaurante, destino, formas, cadastro, erroInicial }: Props) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>(cadastro ? "cadastro" : "inicio");
  const [canal, setCanal] = useState<Canal>("email");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState(cadastro?.nomeSugerido ?? "");
  const [precisaTelefone, setPrecisaTelefone] = useState(cadastro?.precisaTelefone ?? true);
  const [celular, setCelular] = useState("");
  const [erro, setErro] = useState<string | null>(erroInicial);
  const [enviando, iniciar] = useTransition();
  const [reenviarEm, setReenviarEm] = useState(0);
  // Passe anti-robô para pedir o código (vale uma vez: a rodada pede outro depois de cada envio).
  const [passe, setPasse] = useState("");
  const [rodada, setRodada] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  // Cada etapa começa com o cursor no campo (o teclado já abre no celular).
  useEffect(() => {
    if (etapa !== "inicio") campo.current?.focus();
  }, [etapa]);

  useEffect(() => {
    if (reenviarEm <= 0) return;
    const t = setTimeout(() => setReenviarEm((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [reenviarEm]);

  function executar(acao: () => Promise<ResultadoEntrar>, aoSucesso: (r: Extract<ResultadoEntrar, { ok: true }>) => void) {
    setErro(null);
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

  const depoisDoCodigo = (r: Extract<ResultadoEntrar, { ok: true }>) => {
    if (!r.precisaNome) return concluir();
    setNome(r.nomeSugerido ?? "");
    setPrecisaTelefone(r.precisaTelefone ?? false);
    setEtapa("cadastro");
  };

  function pedir() {
    setRodada((r) => r + 1);
    return canal === "email" ? pedirCodigoEmail(slug, email, passe) : pedirCodigo(slug, telefone, passe);
  }

  function enviarEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro("Informe um e-mail válido.");
      return;
    }
    setCanal("email");
    setRodada((r) => r + 1);
    executar(
      () => pedirCodigoEmail(slug, email, passe),
      () => {
        setCodigo("");
        setEtapa("codigo");
        setReenviarEm(ESPERA_REENVIO_S);
      },
    );
  }

  function enviarTelefone(e: React.FormEvent) {
    e.preventDefault();
    if (!telefoneComPais(telefone)) {
      setErro("Informe o celular com DDD.");
      return;
    }
    setCanal("sms");
    setRodada((r) => r + 1);
    executar(
      () => pedirCodigo(slug, telefone, passe),
      () => {
        setCodigo("");
        setEtapa("codigo");
        setReenviarEm(ESPERA_REENVIO_S);
      },
    );
  }

  function enviarCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    executar(
      () => (canal === "email" ? confirmarCodigoEmail(slug, email, codigo) : confirmarCodigo(slug, telefone, codigo)),
      depoisDoCodigo,
    );
  }

  function enviarCadastro(e: React.FormEvent) {
    e.preventDefault();
    if (precisaTelefone && !telefoneComPais(celular)) {
      setErro("Informe o seu celular com DDD.");
      return;
    }
    executar(() => concluirCadastro(slug, nome, precisaTelefone ? celular : undefined), concluir);
  }

  function google() {
    executar(
      () => entrarComGoogle(slug, destino),
      (r) => {
        if (r.url) window.location.assign(r.url);
      },
    );
  }

  const mensagemErro = erro ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {erro}
    </p>
  ) : null;

  if (etapa === "inicio") {
    return (
      <div className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Entre para ver seus pedidos em qualquer aparelho e não precisar digitar o endereço de novo. É opcional: dá para pedir sem
          entrar.
        </p>
        {formas.google ? (
          <Button type="button" variant="outline" className="h-12 gap-3 text-base" disabled={enviando} onClick={google}>
            <LogoGoogle />
            Continuar com Google
          </Button>
        ) : null}
        {formas.google ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            ou com o seu e-mail
            <span className="h-px flex-1 bg-border" />
          </div>
        ) : null}
        <form onSubmit={enviarEmail} className="flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-1 text-sm font-medium">
            E-mail
            <Input
              ref={campo}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              className="h-12 text-base"
              aria-invalid={!!erro}
            />
          </label>
          {mensagemErro}
          <AntiRobo rodada={rodada} aoMudar={setPasse} />
          <Button
            type="submit"
            className="h-12 gap-2 bg-[var(--cor-primaria)] text-base text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90"
            disabled={enviando}
          >
            <Mail className="size-5" aria-hidden />
            {enviando ? "Enviando…" : "Receber código por e-mail"}
          </Button>
        </form>
        {formas.sms ? (
          <button
            type="button"
            className="flex min-h-11 items-center justify-center gap-2 text-sm underline underline-offset-4"
            onClick={() => {
              setErro(null);
              setEtapa("telefone");
            }}
          >
            <Smartphone className="size-4" aria-hidden />
            Prefiro entrar com o celular
          </button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Seu nome, contato e endereços ficam guardados só para os pedidos no {nomeRestaurante}. Você pode excluir a conta quando
          quiser.
        </p>
      </div>
    );
  }

  if (etapa === "telefone") {
    return (
      <form onSubmit={enviarTelefone} className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm" noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Celular (WhatsApp)
          <Input
            ref={campo}
            value={telefone}
            onChange={(e) => setTelefone(mascara(e.target.value))}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(69) 99999-9999"
            className="h-12 text-base"
            aria-invalid={!!erro}
          />
        </label>
        {mensagemErro}
        <AntiRobo rodada={rodada} aoMudar={setPasse} />
        <Button type="submit" className="h-12 text-base" disabled={enviando}>
          {enviando ? "Enviando…" : "Receber código por SMS"}
        </Button>
        <button
          type="button"
          className="min-h-11 text-sm underline underline-offset-4"
          onClick={() => {
            setErro(null);
            setEtapa("inicio");
          }}
        >
          Voltar
        </button>
      </form>
    );
  }

  if (etapa === "codigo") {
    return (
      <form onSubmit={enviarCodigo} className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm" noValidate>
        <p className="text-sm">
          Enviamos um código para{" "}
          <strong className="break-all">{canal === "email" ? email.trim().toLowerCase() : formatarTelefone(telefone)}</strong>.
          {canal === "email" ? " Confira também a caixa de spam." : null}
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Código
          <Input
            ref={campo}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Código"
            className="h-12 text-center text-2xl tracking-[0.3em] tabular-nums placeholder:tracking-normal"
            aria-invalid={!!erro}
          />
        </label>
        {mensagemErro}
        {reenviarEm <= 0 ? <AntiRobo rodada={rodada} aoMudar={setPasse} /> : null}
        <Button type="submit" className="h-12 text-base" disabled={enviando || codigo.length < 6}>
          {enviando ? "Conferindo…" : "Entrar"}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button
            type="button"
            className="min-h-11 underline underline-offset-4"
            onClick={() => {
              setErro(null);
              setEtapa(canal === "email" ? "inicio" : "telefone");
            }}
          >
            {canal === "email" ? "Trocar o e-mail" : "Trocar o número"}
          </button>
          <button
            type="button"
            className="min-h-11 underline underline-offset-4 disabled:no-underline disabled:opacity-60"
            disabled={enviando || reenviarEm > 0}
            onClick={() => executar(pedir, () => setReenviarEm(ESPERA_REENVIO_S))}
          >
            {reenviarEm > 0 ? `Reenviar em ${reenviarEm} s` : "Reenviar código"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={enviarCadastro} className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm" noValidate>
      <p className="text-sm">
        Pronto{cadastro?.email ? <>, você entrou como <strong className="break-all">{cadastro.email}</strong></> : null}! Falta pouco:
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nome
        <Input
          ref={campo}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="name"
          maxLength={120}
          className="h-12 text-base"
          aria-invalid={!!erro}
        />
      </label>
      {precisaTelefone ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Celular (WhatsApp) para o restaurante falar com você
          <Input
            value={celular}
            onChange={(e) => setCelular(mascara(e.target.value))}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(69) 99999-9999"
            className="h-12 text-base"
          />
        </label>
      ) : null}
      {mensagemErro}
      <Button type="submit" className="h-12 text-base" disabled={enviando}>
        {enviando ? "Salvando…" : "Continuar"}
      </Button>
    </form>
  );
}
