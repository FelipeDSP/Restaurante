import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { FormRecuperar } from "./form-recuperar";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false } };

export default function RecuperarSenhaPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Esqueci minha senha</CardTitle>
        </CardHeader>
        <CardContent>
          <FormRecuperar />
        </CardContent>
      </Card>
    </main>
  );
}
