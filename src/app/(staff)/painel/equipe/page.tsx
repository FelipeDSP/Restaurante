import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { ehPapel } from "@/lib/auth/papeis";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";

import { ListaEquipe, type Membro, NovoMembro } from "./lista-equipe";

export const metadata: Metadata = { title: "Equipe" };

export default async function EquipePage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("membros")
    .select("id, user_id, nome, papel, ativo")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) throw new Error(error.message);

  // E-mails ficam no Auth; só o servidor com a chave secreta consegue ler.
  const admin = createAdminClient();
  const emails = new Map<string, string | null>();
  if (admin) {
    await Promise.all(
      data.map(async (m) => {
        const { data: usuario } = await admin.auth.admin.getUserById(m.user_id);
        emails.set(m.user_id, usuario.user?.email ?? null);
      }),
    );
  }

  const membros: Membro[] = data.flatMap((m) =>
    ehPapel(m.papel)
      ? [
          {
            id: m.id,
            nome: m.nome,
            papel: m.papel,
            ativo: m.ativo,
            email: emails.get(m.user_id) ?? null,
            euMesmo: m.id === acesso.membroId,
          },
        ]
      : [],
  );

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Equipe</h1>
        <p className="text-muted-foreground">
          Dono: tudo. Caixa: painel, pagamentos e delivery. Garçom: app de mesas. Cozinha: só a tela da cozinha.
        </p>
      </div>
      {!admin ? (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Cadastrar pessoas e trocar senhas ainda não está disponível neste servidor. Fale com o suporte. Editar
          nome, papel e acesso funciona normalmente.
        </p>
      ) : null}
      <NovoMembro habilitado={Boolean(admin)} enderecoLogin={`${await origemDoSite()}/login`} restaurante={acesso.restaurante.nome} />
      <ListaEquipe membros={membros} contasHabilitadas={Boolean(admin)} />
    </main>
  );
}
