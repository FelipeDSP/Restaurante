import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { ListaMesas, NovasMesas } from "./lista-mesas";

export const metadata: Metadata = { title: "Mesas" };

export default async function MesasPage() {
  const acesso = await exigirPermissao("painel", "mesas");
  const supabase = await createClient();

  const { data: mesas, error } = await supabase
    .from("mesas")
    .select("id, numero, ativa")
    .eq("restaurante_id", acesso.restaurante.id)
    .order("ordem")
    .order("numero");
  if (error) throw new Error(error.message);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mesas</h1>
        <Link href="/painel/mesas/qrcode" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          <QrCode aria-hidden />
          QR code das mesas
        </Link>
      </div>
      <NovasMesas />
      <ListaMesas mesas={mesas} />
    </main>
  );
}
