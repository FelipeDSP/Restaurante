import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";

import { carregarPracasAtivas, carregarTickets } from "@/modulos/cozinha/dados";
import { TicketsPracas } from "@/modulos/mesas/tickets-setores";

export const metadata: Metadata = { title: "Pedidos" };

// Cozinha e churrasqueira imprimem o ticket no papel (sem tela, por causa da gordura);
// o garçom retira o prato e marca aqui que o setor terminou. Para ele a aba é "Pedidos": é o
// que está na cozinha esperando ser pego.
export default async function PracasPage() {
  const acesso = await exigirPermissao("painel", "garcom_app");
  const [{ pendentes, prontos, geradoEm }, pracas] = await Promise.all([
    carregarTickets(acesso.restaurante.id),
    carregarPracasAtivas(acesso.restaurante.id),
  ]);

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["tarefas_producao", "itens_pedido", "pedidos"]} />
      <h1 className="sr-only">Pedidos na cozinha</h1>
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
