"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { mensagemFalhaRede } from "@/components/staff/acoes-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { definirSenhaCliente } from "../entrar/actions";

export function FormSenhaCliente({ slug }: { slug: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-4 rounded-xl bg-background p-4 shadow-sm"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          try {
            const r = await definirSenhaCliente(slug, senha, confirmacao);
            if (!r.ok) return setErro(r.mensagem);
            router.replace(`/${slug}/conta`);
            router.refresh();
          } catch {
            setErro(mensagemFalhaRede());
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Senha nova (mínimo 8 caracteres)
        <Input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="new-password" maxLength={72} className="h-12 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Repita a senha
        <Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} type="password" autoComplete="new-password" maxLength={72} className="h-12 text-base" />
      </label>
      {erro ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      ) : null}
      <Button type="submit" className="h-12 bg-[var(--cor-primaria)] text-base text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90" disabled={enviando}>
        {enviando ? "Salvando…" : "Salvar e entrar"}
      </Button>
    </form>
  );
}
