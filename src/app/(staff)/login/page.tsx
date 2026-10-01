import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { destinoInicial, obterUsuario } from "@/lib/auth/dal";

import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await obterUsuario()) redirect(await destinoInicial());

  const { next } = await props.searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Entrar</CardTitle>
        </CardHeader>
        <CardContent>
          <FormLogin next={typeof next === "string" ? next : undefined} />
        </CardContent>
      </Card>
    </main>
  );
}
