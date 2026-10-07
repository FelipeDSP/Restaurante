import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { destinoInicial, obterUsuario } from "@/lib/auth/dal";

import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await obterUsuario()) redirect(await destinoInicial());

  const { next, erro } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Entrar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {erro === "link-invalido" ? (
            <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              O link de confirmação expirou ou já foi usado. Entre com seu e-mail e senha.
            </p>
          ) : null}
          <FormLogin next={typeof next === "string" ? next : undefined} />
          <p className="text-center text-sm text-muted-foreground">
            Quer usar no seu restaurante?{" "}
            <Link href="/cadastro" className="font-medium text-foreground underline underline-offset-4">
              Criar conta
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
