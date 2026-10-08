"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarTelefone, telefoneComPais } from "@/lib/telefone";

import { concluirCadastro, confirmarCodigo, pedirCodigo, type ResultadoEntrar } from "./actions";

type Etapa = "telefone" | "codigo" | "nome";

const ESPERA_REENVIO_S = 60;

// (69) 99999-1234 enquanto digita.
function mascara(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function EntrarCliente({ slug, nomeRestaurante, destino }: { slug: string; nomeRestaurante: string; destino: string }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("telefone");
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [reenviarEm, setReenviarEm] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  // Cada etapa começa com o cursor no campo (o teclado já abre no celular).
  useEffect(() => {
    campo.current?.focus();
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

  function enviarTelefone(e: React.FormEvent) {
    e.preventDefault();
    if (!telefoneComPais(telefone)) {
      setErro("Informe o celular com DDD.");
      return;
    }
    executar(
      () => pedirCodigo(slug, telefone),
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
      () => confirmarCodigo(slug, telefone, codigo),
      (r) => {
        if (r.precisaNome) {
          setNome(r.nomeSugerido ?? "");
          setEtapa("nome");
        } else concluir();
      },
    );
  }

  function enviarNome(e: React.FormEvent) {
    e.preventDefault();
    executar(() => concluirCadastro(slug, nome), concluir);
  }

  const mensagemErro = erro ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {erro}
    </p>
  ) : null;

  if (etapa === "telefone") {
    return (
      <form onSubmit={enviarTelefone} className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm" noValidate>
        <p className="text-sm text-muted-foreground">
          Entre com o seu celular para ver seus pedidos em qualquer aparelho e não precisar digitar o endereço de novo. É opcional:
          dá para pedir sem entrar.
        </p>
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
        <Button type="submit" className="h-12 text-base" disabled={enviando}>
          {enviando ? "Enviando…" : "Receber código"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Seu nome, telefone e endereços ficam guardados só para os pedidos no {nomeRestaurante}. Você pode excluir a conta quando
          quiser.
        </p>
      </form>
    );
  }

  if (etapa === "codigo") {
    return (
      <form onSubmit={enviarCodigo} className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm" noValidate>
        <p className="text-sm">
          Enviamos um código de 6 números para <strong className="whitespace-nowrap">{formatarTelefone(telefone)}</strong>.
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Código
          <Input
            ref={campo}
            value={codigo}
            onChange={(e) => {
              const valor = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCodigo(valor);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="h-12 text-center text-2xl tracking-[0.5em] tabular-nums"
            aria-invalid={!!erro}
          />
        </label>
        {mensagemErro}
        <Button type="submit" className="h-12 text-base" disabled={enviando || codigo.length !== 6}>
          {enviando ? "Conferindo…" : "Entrar"}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button
            type="button"
            className="min-h-11 underline underline-offset-4"
            onClick={() => {
              setErro(null);
              setEtapa("telefone");
            }}
          >
            Trocar o número
          </button>
          <button
            type="button"
            className="min-h-11 underline underline-offset-4 disabled:no-underline disabled:opacity-60"
            disabled={enviando || reenviarEm > 0}
            onClick={() =>
              executar(
                () => pedirCodigo(slug, telefone),
                () => setReenviarEm(ESPERA_REENVIO_S),
              )
            }
          >
            {reenviarEm > 0 ? `Reenviar em ${reenviarEm} s` : "Reenviar código"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={enviarNome} className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm" noValidate>
      <p className="text-sm">Pronto! Como podemos te chamar?</p>
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
      {mensagemErro}
      <Button type="submit" className="h-12 text-base" disabled={enviando}>
        {enviando ? "Salvando…" : "Continuar"}
      </Button>
    </form>
  );
}
