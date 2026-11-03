import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";

import { carregarSessaoAberta } from "../caixa/dados";
import { carregarEntregadores, carregarPedidosDelivery } from "./dados";
import { QuadroDelivery } from "./quadro-delivery";

export const metadata: Metadata = { title: "Delivery" };

export default async function DeliveryPage() {
  const acesso = await exigirPermissao("painel", "delivery");
  const sessao = await carregarSessaoAberta(acesso.restaurante.id);
  const fuso = acesso.restaurante.fusoHorario;

  // Em andamento (de qualquer sessão) + finalizados da sessão atual.
  const filtro = sessao
    ? `status.not.in.(entregue,cancelado),caixa_sessao_id.eq.${sessao.id}`
    : "status.not.in.(entregue,cancelado)";
  const [pedidos, entregadores] = await Promise.all([
    carregarPedidosDelivery(acesso.restaurante.id, fuso, { ou: filtro }),
    carregarEntregadores(acesso.restaurante.id),
  ]);

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["pedidos", "pagamentos", "tarefas_producao", "pedidos_mensagens"]} />
      <div>
        <h1 className="text-2xl font-semibold">Delivery</h1>
        {/* Só o que importa agora: com o caixa fechado, o site não recebe pedidos. */}
        {!sessao ? (
          <p className="text-sm font-medium text-destructive">Caixa fechado: o site não recebe pedidos até o caixa ser aberto.</p>
        ) : null}
      </div>
      <QuadroDelivery pedidos={pedidos} entregadores={entregadores} />
    </main>
  );
}
