import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL } from "@/lib/auth/papeis";

export default async function PainelPage() {
  const acesso = await exigirAcesso("painel");

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{acesso.restaurante.nome}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Você está como <strong className="text-foreground">{NOME_PAPEL[acesso.papel]}</strong>.
        </CardContent>
      </Card>
    </main>
  );
}
