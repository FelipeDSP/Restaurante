import type { Metadata } from "next";

import { AbasPerfil } from "@/components/staff/abas-perfil";
import { AvisosNoCelular } from "@/components/staff/avisos-no-celular";
import { EscolherAvisos } from "@/components/staff/escolher-avisos";
import { EscolherSom } from "@/components/staff/escolher-som";
import { eventosDaPessoa } from "@/lib/avisos";
import { chavePublicaAvisos } from "@/lib/avisos-equipe";
import { exigirAcesso } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage() {
  const acesso = await exigirAcesso("cozinha");
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AbasPerfil base="/cozinha/perfil" />
      <AvisosNoCelular chavePublica={chavePublicaAvisos()} />
      <EscolherSom atual={acesso.usuario.som} />
      <EscolherAvisos atual={acesso.usuario.avisos} eventos={eventosDaPessoa(acesso.permissoes)} />
    </main>
  );
}
