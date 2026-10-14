import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirAcesso } from "@/lib/auth/dal";

import { carregarPracasAtivas, carregarTickets } from "../../cozinha/dados";
import { TicketsPracas } from "./tickets-pracas";

export const metadata: Metadata = { title: "Praças" };

// Cozinha e churrasqueira imprimem o ticket no papel (sem tela, por causa da gordura);
// o garçom retira o prato e marca aqui que a praça terminou.
export default async function PracasGarcomPage() {
  const acesso = await exigirAcesso("garcom");
  const [{ pendentes, prontos, geradoEm }, pracas] = await Promise.all([
    carregarTickets(acesso.restaurante.id),
    carregarPracasAtivas(acesso.restaurante.id),
  ]);

  return (
    <main className="flex flex-col gap-4 p-4 pb-28">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["tarefas_producao", "itens_pedido", "pedidos"]} />
      <div>
        <h1 className="text-2xl font-semibold">Praças</h1>
        <p className="text-sm text-muted-foreground">Ao retirar o prato na praça, toque em Retirei.</p>
      </div>
      <TicketsPracas
        restauranteId={acesso.restaurante.id}
        membroId={acesso.membroId}
        fuso={acesso.restaurante.fusoHorario}
        pracas={pracas}
        pendentes={pendentes}
        prontos={prontos}
        geradoEm={geradoEm}
      />
    </main>
  );
}
