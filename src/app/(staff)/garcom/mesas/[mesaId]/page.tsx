import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirAcesso } from "@/lib/auth/dal";
import { id as idSchema } from "@/lib/validacao";

import { AvisoCaixaFechado } from "../../aviso-caixa";
import { caixaEstaAberto, carregarComandaDaMesa, carregarMesa } from "../../dados";
import { AbrirComanda } from "./abrir-comanda";
import { TelaComanda } from "./tela-comanda";

export async function generateMetadata(props: PageProps<"/garcom/mesas/[mesaId]">): Promise<Metadata> {
  const acesso = await exigirAcesso("garcom");
  const { mesaId } = await props.params;
  const mesa = idSchema.safeParse(mesaId).success ? await carregarMesa(acesso.restaurante.id, mesaId) : null;
  return { title: mesa ? `Mesa ${mesa.numero}` : "Mesa" };
}

export default async function MesaPage(props: PageProps<"/garcom/mesas/[mesaId]">) {
  const acesso = await exigirAcesso("garcom");
  const { mesaId } = await props.params;
  if (!idSchema.safeParse(mesaId).success) notFound();

  const [mesa, comanda, caixaAberto] = await Promise.all([
    carregarMesa(acesso.restaurante.id, mesaId),
    carregarComandaDaMesa(acesso.restaurante.id, mesaId),
    caixaEstaAberto(acesso.restaurante.id),
  ]);
  if (!mesa) notFound();

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <AtualizarEmTempoReal
        restauranteId={acesso.restaurante.id}
        tabelas={["comandas", "itens_pedido", "pagamentos"]}
      />
      <div className="flex items-center gap-2">
        <Link
          href="/garcom"
          className="-ml-2 flex h-11 items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted"
        >
          <ChevronLeft className="size-5" />
          Mesas
        </Link>
      </div>
      <h1 className="text-3xl font-bold">Mesa {mesa.numero}</h1>
      {!caixaAberto ? <AvisoCaixaFechado /> : null}

      {comanda ? (
        <TelaComanda
          key={comanda.id}
          mesaId={mesa.id}
          comanda={comanda}
          podeGerenciar={acesso.papel !== "garcom"}
          fusoHorario={acesso.restaurante.fusoHorario}
        />
      ) : mesa.ativa ? (
        <AbrirComanda mesaId={mesa.id} desabilitado={!caixaAberto} />
      ) : (
        <p className="text-muted-foreground">Mesa desativada.</p>
      )}
    </main>
  );
}
