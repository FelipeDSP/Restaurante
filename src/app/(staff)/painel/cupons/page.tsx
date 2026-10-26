import type { Metadata } from "next";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { diaLocal } from "@/lib/tempo";

import { type Cupom, ListaCupons, NovoCupom } from "./lista-cupons";

export const metadata: Metadata = { title: "Cupons" };

export default async function CuponsPage() {
  const acesso = await exigirPermissao("painel", "cupons");
  const supabase = await createClient();
  const fuso = acesso.restaurante.fusoHorario;

  const [{ data, error }, { data: usos }] = await Promise.all([
    supabase
      .from("cupons")
      .select("id, codigo, tipo, valor, pedido_minimo, inicio, fim, limite_usos, um_por_cliente, ativo")
      .eq("restaurante_id", acesso.restaurante.id)
      .order("ativo", { ascending: false })
      .order("criado_em", { ascending: false }),
    // Usos = pedidos não cancelados com o cupom (o mesmo que o banco conta para o limite).
    supabase
      .from("pedidos")
      .select("cupom_id, desconto")
      .eq("restaurante_id", acesso.restaurante.id)
      .not("cupom_id", "is", null)
      .neq("status", "cancelado"),
  ]);
  if (error) throw new Error(error.message);

  const agora = new Date().toISOString();
  const cupons: Cupom[] = data.map((c) => {
    const doCupom = (usos ?? []).filter((u) => u.cupom_id === c.id);
    return {
      id: c.id,
      codigo: c.codigo,
      tipo: c.tipo as Cupom["tipo"],
      valor: c.valor,
      pedidoMinimo: c.pedido_minimo,
      inicio: c.inicio ? diaLocal(c.inicio, fuso) : null,
      fim: c.fim ? diaLocal(c.fim, fuso) : null,
      vencido: Boolean(c.fim && c.fim <= agora),
      limiteUsos: c.limite_usos,
      umPorCliente: c.um_por_cliente,
      ativo: c.ativo,
      usos: doCupom.length,
      descontoTotal: doCupom.reduce((s, u) => s + u.desconto, 0),
    };
  });

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Cupons</h1>
      <NovoCupom />
      <ListaCupons cupons={cupons} />
    </main>
  );
}
