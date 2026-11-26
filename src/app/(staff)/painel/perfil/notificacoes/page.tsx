import type { Metadata } from "next";

import { AbasPerfil } from "@/components/staff/abas-perfil";
import { EscolherAvisos } from "@/components/staff/escolher-avisos";
import { EscolherSom } from "@/components/staff/escolher-som";
import { eventosDaPessoa } from "@/lib/avisos";
import { exigirAcesso } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage() {
  const acesso = await exigirAcesso("painel");
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AbasPerfil base="/painel/perfil" />
      <EscolherSom atual={acesso.usuario.som} />
      <EscolherAvisos atual={acesso.usuario.avisos} eventos={eventosDaPessoa(acesso.permissoes)} />
    </main>
  );
}
