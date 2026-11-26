import type { Metadata } from "next";

import { AbasPerfil } from "@/components/staff/abas-perfil";
import { MeuPerfil } from "@/components/staff/meu-perfil";
import { exigirAcesso } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const acesso = await exigirAcesso("cozinha");
  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <AbasPerfil base="/cozinha/perfil" />
      <MeuPerfil
        usuarioId={acesso.usuario.id}
        nome={acesso.nome}
        telefone={acesso.telefone}
        foto={acesso.foto}
        email={acesso.usuario.email}
        funcao={acesso.funcao}
      />
    </main>
  );
}
