import { Bike, Boxes, ChevronRight, Clock, type LucideIcon, MessageCircle, Printer, ReceiptText } from "lucide-react";
import Link from "next/link";

import type { Disponibilidade } from "@/app/(publico)/[slug]/dados";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Permissao } from "@/lib/auth/papeis";

import type { Pendencias } from "./pendencias";

type Linha = { chave: string; href: string | null; icone: LucideIcon; texto: string; urgente?: boolean };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// Por que o site não recebe pedido, dito para quem pode resolver.
const MOTIVO_DO_SITE: Record<NonNullable<Disponibilidade["motivo"]>, string> = {
  restaurante_indisponivel: "O restaurante está desativado ou a assinatura está suspensa.",
  sem_delivery: "O delivery pelo site está desligado.",
  fora_do_horario: "Está fora do horário de funcionamento que você cadastrou.",
  caixa_fechado: "O caixa está fechado.",
};

// Primeira coisa do Início: o que está esperando alguém. Some inteiro quando não há nada — tela
// vazia aqui é boa notícia, e um cartão dizendo "nada pendente" só ocuparia espaço todo dia.
export function PrecisaDeVoce({
  pendencias,
  permissoes,
  caixaAberto,
}: {
  pendencias: Pendencias;
  permissoes: Permissao[];
  caixaAberto: boolean;
}) {
  const linhas: Linha[] = [];

  if (pendencias.deliveryNovos > 0) {
    linhas.push({
      chave: "delivery",
      href: "/painel/delivery",
      icone: Bike,
      texto: `${plural(pendencias.deliveryNovos, "pedido", "pedidos")} de delivery esperando aceite`,
      urgente: true,
    });
  }
  if (pendencias.contaPedida > 0) {
    linhas.push({
      chave: "conta",
      href: "/painel/comandas",
      icone: ReceiptText,
      texto: `${plural(pendencias.contaPedida, "mesa pediu", "mesas pediram")} a conta`,
      urgente: true,
    });
  }
  if (pendencias.mensagens > 0) {
    linhas.push({
      chave: "mensagens",
      href: "/painel/conversas",
      icone: MessageCircle,
      texto: `${plural(pendencias.mensagens, "mensagem", "mensagens")} de cliente sem resposta`,
    });
  }
  if (pendencias.impressao > 0) {
    linhas.push({
      chave: "impressao",
      href: "/painel/impressoras",
      icone: Printer,
      texto: `${plural(pendencias.impressao, "impressão não saiu", "impressões não saíram")}`,
    });
  }
  // Site fechado: o caixa fechado já tem cartão próprio logo abaixo, não se repete aqui.
  const site = pendencias.site;
  if (!site.aberto && site.motivo && site.motivo !== "caixa_fechado" && caixaAberto) {
    linhas.push({
      chave: "site",
      // Quem não pode mexer nos horários continua vendo o aviso, mas sem link: levar o caixa
      // para uma tela que ele não abre é pior do que só informar.
      href: permissoes.includes("restaurante") ? "/painel/restaurante" : null,
      icone: Clock,
      texto: `O site não está recebendo pedidos. ${MOTIVO_DO_SITE[site.motivo]}`,
      urgente: true,
    });
  }
  if (pendencias.estoque > 0) {
    linhas.push({
      chave: "estoque",
      href: "/painel/estoque",
      icone: Boxes,
      texto: `${plural(pendencias.estoque, "item acabando", "itens acabando")} no estoque`,
    });
  }

  if (linhas.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardHeader>
        <CardTitle>Precisa de você</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {linhas.map((linha) => {
          const miolo = (
            <>
              <linha.icone className={`size-4 shrink-0 ${linha.urgente ? "text-red-700" : "text-amber-700"}`} aria-hidden />
              <span className={`min-w-0 flex-1 ${linha.urgente ? "font-semibold text-red-900" : "text-amber-900"}`}>{linha.texto}</span>
              {linha.href ? <ChevronRight className="size-4 shrink-0 text-amber-700" aria-hidden /> : null}
            </>
          );
          const classe = "-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm";
          return linha.href ? (
            <Link key={linha.chave} href={linha.href} className={`${classe} hover:bg-amber-100/70`}>
              {miolo}
            </Link>
          ) : (
            <div key={linha.chave} className={classe}>
              {miolo}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
