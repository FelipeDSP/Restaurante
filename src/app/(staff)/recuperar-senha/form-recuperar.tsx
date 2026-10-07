"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pedirRecuperacao } from "@/lib/auth/actions";

export function FormRecuperar() {
  const [estado, acao, enviando] = useActionState(pedirRecuperacao, undefined);

  if (estado?.enviado) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p>
          Se existir uma conta com <strong>{estado.email}</strong>, enviamos um link para criar uma senha nova. Confira a
          caixa de entrada e o spam.
        </p>
        <p className="text-sm text-muted-foreground">
          Garçom, caixa e cozinha sem acesso ao e-mail: peça ao dono para trocar a senha em Painel › Equipe.
        </p>
        <Link href="/login" className="text-sm font-medium underline underline-offset-4">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Informe o e-mail da sua conta. Enviaremos um link para criar uma senha nova.</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          key={estado?.email ?? ""}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={estado?.email}
          className="h-12 text-base"
        />
      </div>
      {estado?.erro ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar link"}
      </Button>
      <Link href="/login" className="text-center text-sm text-muted-foreground underline underline-offset-4">
        Voltar para o login
      </Link>
    </form>
  );
}
