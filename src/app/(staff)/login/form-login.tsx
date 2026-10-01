"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrar } from "@/lib/auth/actions";

export function FormLogin({ next }: { next?: string }) {
  const [estado, acao, enviando] = useActionState(entrar, undefined);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          // Remonta com o e-mail devolvido após erro (campo não controlado).
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 text-base"
        />
      </div>

      {estado?.erro ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
