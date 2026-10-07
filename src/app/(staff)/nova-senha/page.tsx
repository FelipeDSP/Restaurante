import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { obterUsuario } from "@/lib/auth/dal";

import { FormNovaSenha } from "./form-nova-senha";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };

// Chega aqui pelo link do e-mail (o /auth/confirmar já abriu a sessão de recuperação).
export default async function NovaSenhaPage() {
  if (!(await obterUsuario())) redirect("/recuperar-senha");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Criar senha nova</CardTitle>
        </CardHeader>
        <CardContent>
          <FormNovaSenha />
        </CardContent>
      </Card>
    </main>
  );
}
