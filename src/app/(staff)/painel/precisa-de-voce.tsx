import { Bike, ChevronRight, Clock, DoorClosed, DoorOpen, type LucideIcon, MessageCircle, Printer, ReceiptText } from "lucide-react";
import Link from "next/link";

import type { Disponibilidade } from "@/app/(publico)/[slug]/dados";
import type { Permissao } from "@/lib/auth/papeis";
import { dataHoraLocal } from "@/lib/tempo";
import { cn } from "@/lib/utils";

import type { Pendencias } from "./pendencias";

type Linha = {
  chave: string;
  href: string | null;
  icone: LucideIcon;
  // O número em destaque, lido antes do texto. Nulo quando a pendência não se conta (o site fora
  // do horário é uma coisa só).
  quantidade: number | null;
  titulo: string;
  detalhe: string;
  urgente?: boolean;
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

// Por que o site não recebe pedido, dito para quem pode resolver.
const MOTIVO_DO_SITE: Record<NonNullable<Disponibilidade["motivo"]>, string> = {
  restaurante_indisponivel: "O restaurante está desativado ou a assinatura está suspensa.",
  sem_delivery: "O delivery pelo site está desligado.",
  fora_do_horario: "Está fora do horário que você cadastrou.",
  caixa_fechado: "O caixa está fechado.",
};

// Primeira coisa do Início: o que está esperando alguém. Some inteiro quando não há nada — tela
// vazia aqui é boa notícia, e um cartão dizendo "nada pendente" só ocuparia espaço todo dia.
export function PrecisaDeVoce({ pendencias, permissoes, fuso }: { pendencias: Pendencias; permissoes: Permissao[]; fuso: string }) {
  const linhas: Linha[] = [];
  const { sessao } = pendencias;

  if (pendencias.deliveryNovos > 0) {
    linhas.push({
      chave: "delivery",
      href: "/painel/delivery",
      icone: Bike,
      quantidade: pendencias.deliveryNovos,
      titulo: `${plural(pendencias.deliveryNovos, "pedido", "pedidos")} de delivery sem aceite`,
      detalhe: "O cliente está esperando a confirmação",
      urgente: true,
    });
  }
  if (pendencias.contaPedida > 0) {
    linhas.push({
      chave: "conta",
      href: "/painel/comandas",
      icone: ReceiptText,
      quantidade: pendencias.contaPedida,
      titulo: `${plural(pendencias.contaPedida, "mesa pediu", "mesas pediram")} a conta`,
      detalhe: "Alguém está com a mão levantada no salão",
      urgente: true,
    });
  }
  if (pendencias.mensagens > 0) {
    linhas.push({
      chave: "mensagens",
      href: "/painel/conversas",
      icone: MessageCircle,
      quantidade: pendencias.mensagens,
      titulo: `${plural(pendencias.mensagens, "mensagem", "mensagens")} de cliente sem resposta`,
      detalhe: "Na conversa do pedido de delivery",
    });
  }
  if (pendencias.impressao > 0) {
    linhas.push({
      chave: "impressao",
      href: "/painel/impressoras",
      icone: Printer,
      quantidade: pendencias.impressao,
      titulo: `${plural(pendencias.impressao, "impressão não saiu", "impressões não saíram")}`,
      detalhe: "Confira o computador e a impressora",
    });
  }
  // Caixa fechado, por si só, não é pendência: de manhã, e em todo dia de folga, é o estado
  // normal. O que é pendência é o caixa fechado **dentro do horário de funcionamento** — aí o
  // cliente abre o site e não consegue pedir.
  //
  // Quem decide isso é o banco: `consultar_disponibilidade_delivery` só responde `caixa_fechado`
  // depois de passar pelo horário cadastrado. (Restaurante com o delivery desligado para antes,
  // em `sem_delivery`, e não recebe este aviso.)
  const caixaAberto = Boolean(sessao);
  const site = pendencias.site;
  if (!sessao && site.motivo === "caixa_fechado") {
    linhas.push({
      chave: "caixa",
      href: permissoes.includes("caixa_operar") ? "/painel/caixa" : null,
      icone: DoorClosed,
      quantidade: null,
      titulo: "Abra o caixa",
      detalhe: "Já está no horário de funcionamento, e sem caixa aberto o site recusa pedido",
      urgente: true,
    });
  }
  if (sessao && pendencias.caixaEsquecido) {
    // Caixa aberto há mais de um dia é quase sempre esquecimento, e enquanto ele não fecha o
    // resumo da noite e os relatórios misturam dias diferentes.
    linhas.push({
      chave: "caixa-velho",
      href: permissoes.includes("caixa_operar") ? "/painel/caixa" : null,
      icone: DoorOpen,
      quantidade: null,
      titulo: `Caixa aberto desde ${dataHoraLocal(sessao.abertaEm, fuso)}`,
      detalhe: "Parece que ninguém fechou a noite. O resumo só fecha quando o caixa fecha",
    });
  }
  // Site fora do ar por outro motivo. Só com o caixa aberto: se ninguém abriu o caixa, o
  // restaurante não está operando e não há nada a cobrar.
  if (!site.aberto && site.motivo && site.motivo !== "caixa_fechado" && caixaAberto) {
    linhas.push({
      chave: "site",
      // Quem não pode mexer nos horários continua vendo o aviso, mas sem link: levar o caixa
      // para uma tela que ele não abre é pior do que só informar.
      href: permissoes.includes("restaurante") ? "/painel/restaurante" : null,
      icone: Clock,
      quantidade: null,
      titulo: "O site não está recebendo pedidos",
      detalhe: MOTIVO_DO_SITE[site.motivo],
      urgente: true,
    });
  }
  if (linhas.length === 0) return null;

  const urgentes = linhas.filter((l) => l.urgente).length;

  return (
    <section
      aria-label="Precisa de você"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-amber-950">Precisa de você</h2>
        {urgentes > 0 ? (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {urgentes} {plural(urgentes, "urgente", "urgentes")}
          </span>
        ) : null}
      </div>
      {/* Duas colunas no computador: cinco pendências numa coluna só viravam uma lista comprida
          que empurrava os números da noite para fora da tela. */}
      <ul className="grid gap-2 lg:grid-cols-2">
        {linhas.map((linha) => {
          const miolo = (
            <>
              <span
                className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-white", linha.urgente ? "bg-red-600" : "bg-amber-500")}
                aria-hidden
              >
                <linha.icone className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-semibold", linha.urgente ? "text-red-900" : "text-amber-950")}>
                  {linha.quantidade !== null ? <span className="tabular-nums">{linha.quantidade} </span> : null}
                  {linha.titulo}
                </span>
                <span className="block truncate text-xs text-amber-900/70">{linha.detalhe}</span>
              </span>
              {linha.href ? <ChevronRight className="size-5 shrink-0 text-amber-700" aria-hidden /> : null}
            </>
          );
          const classe = "flex min-h-11 items-center gap-3 rounded-xl bg-white/70 p-2.5 text-sm";
          return (
            <li key={linha.chave} className="min-w-0">
              {linha.href ? (
                <Link href={linha.href} className={cn(classe, "hover:bg-white")}>
                  {miolo}
                </Link>
              ) : (
                <div className={classe}>{miolo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
