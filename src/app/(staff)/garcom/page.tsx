import { exigirAcesso } from "@/lib/auth/dal";

export default async function GarcomPage() {
  const acesso = await exigirAcesso("garcom");

  return (
    <main className="flex flex-col gap-2 p-4">
      <h1 className="text-2xl font-semibold">Mesas</h1>
      <p className="text-muted-foreground">Olá, {acesso.nome}. O mapa de mesas chega na Etapa 5.</p>
    </main>
  );
}
