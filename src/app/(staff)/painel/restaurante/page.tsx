import type { Metadata } from "next";

import { exigirDono } from "@/lib/auth/dal";
import { lerHorarios } from "@/lib/horarios";
import { createClient } from "@/lib/supabase/server";

import { FormRestaurante } from "./form-restaurante";

export const metadata: Metadata = { title: "Restaurante" };

export default async function RestaurantePage() {
  const acesso = await exigirDono();
  const supabase = await createClient();

  const { data: r, error } = await supabase
    .from("restaurantes")
    .select(
      "id, slug, nome, telefone, whatsapp, endereco, cor_primaria, cor_secundaria, logo_url, fuso_horario, horarios, aceita_delivery, pedido_minimo, tempo_estimado_entrega_min",
    )
    .eq("id", acesso.restaurante.id)
    .single();
  if (error) throw new Error(error.message);

  const endereco =
    r.endereco && typeof r.endereco === "object" && !Array.isArray(r.endereco)
      ? (r.endereco as Record<string, string | null>)
      : {};

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Dados e marca</h1>
      <FormRestaurante restaurante={{ ...r, endereco, horarios: lerHorarios(r.horarios) }} />
    </main>
  );
}
