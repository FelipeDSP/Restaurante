import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";

import { carregarConversas } from "./dados";
import { ListaConversas } from "./lista-conversas";

export const metadata: Metadata = { title: "Conversas" };

export default async function ConversasPage() {
  const acesso = await exigirPermissao("painel", "delivery");
  const conversas = await carregarConversas(acesso.restaurante.id, acesso.restaurante.fusoHorario);

  return (
    <main className="flex flex-1 flex-col gap-3 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["pedidos", "pedidos_mensagens"]} />
      <h1 className="text-2xl font-semibold">Conversas</h1>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <ListaConversas conversas={conversas} />
        <p className="hidden items-center justify-center rounded-xl border border-dashed p-8 text-muted-foreground lg:flex">
          Escolha uma conversa
        </p>
      </div>
    </main>
  );
}
