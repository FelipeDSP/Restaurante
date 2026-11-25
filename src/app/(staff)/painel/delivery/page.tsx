import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";

import { carregarSessaoAberta } from "../caixa/dados";
import { FINALIZADOS_NO_QUADRO, carregarEntregadores, carregarPedidosDelivery } from "./dados";
import { QuadroDelivery } from "./quadro-delivery";

export const metadata: Metadata = { title: "Delivery" };

export default async function DeliveryPage() {
  const acesso = await exigirPermissao("painel", "delivery");
  const sessao = await carregarSessaoAberta(acesso.restaurante.id);
  const fuso = acesso.restaurante.fusoHorario;

  // Em andamento (de qualquer sessão) + só os últimos finalizados da sessão: o quadro é
  // operacional e trazia até 200 finalizados, renderizando todos. O resto está no Histórico.
  const [emAndamento, finalizados, entregadores] = await Promise.all([
    carregarPedidosDelivery(acesso.restaurante.id, fuso, { emAndamento: true }),
    sessao
      ? carregarPedidosDelivery(acesso.restaurante.id, fuso, { finalizadosDaSessao: sessao.id, quantos: FINALIZADOS_NO_QUADRO })
      : Promise.resolve([]),
    carregarEntregadores(acesso.restaurante.id),
  ]);
  const pedidos = [...emAndamento, ...finalizados];

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
      <QuadroDelivery pedidos={pedidos} entregadores={entregadores} finalizadosNoQuadro={FINALIZADOS_NO_QUADRO} />
    </main>
  );
}
