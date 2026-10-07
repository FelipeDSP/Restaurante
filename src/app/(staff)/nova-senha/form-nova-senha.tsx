"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirNovaSenha } from "@/lib/auth/actions";

export function FormNovaSenha() {
  const [estado, acao, enviando] = useActionState(definirNovaSenha, undefined);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Senha nova</Label>
        <Input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required className="h-12 text-base" />
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmacao">Repita a senha</Label>
        <Input id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" required className="h-12 text-base" />
      </div>
      {estado?.erro ? (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar e entrar"}
      </Button>
    </form>
  );
}
