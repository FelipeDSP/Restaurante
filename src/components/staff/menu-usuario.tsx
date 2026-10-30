"use client";

import { ArrowLeftRight, CreditCard, LogOut, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sair } from "@/lib/auth/actions";

type Props = {
  nome: string;
  papel: string;
  podeTrocarRestaurante: boolean;
  outraArea?: { href: string; rotulo: string };
  // Só para o dono da plataforma (super admin).
  adminPlataforma?: boolean;
  // Dono: plano e pagamento ficam aqui, fora do menu do dia a dia.
  assinatura?: boolean;
  // Link do WhatsApp do suporte (já com o restaurante na mensagem).
  ajuda?: string;
};

export function MenuUsuario({ nome, papel, podeTrocarRestaurante, outraArea, adminPlataforma, assinatura, ajuda }: Props) {
  const [saindo, iniciar] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="flex size-11 items-center justify-center rounded-full border border-[var(--cor-primaria-contraste)]/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <UserRound className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block text-sm text-foreground">{nome}</span>
            <span className="block">{papel}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {outraArea ? (
          <DropdownMenuItem className="h-10" render={<Link href={outraArea.href} />}>
            {outraArea.rotulo}
          </DropdownMenuItem>
        ) : null}
        {assinatura ? (
          <DropdownMenuItem className="h-10" render={<Link href="/painel/assinatura" />}>
            <CreditCard />
            Assinatura
          </DropdownMenuItem>
        ) : null}
        {adminPlataforma ? (
          <DropdownMenuItem className="h-10" render={<Link href="/admin" />}>
            <ShieldCheck />
            Painel da plataforma
          </DropdownMenuItem>
        ) : null}
        {ajuda ? (
          <DropdownMenuItem className="h-10" render={<a href={ajuda} target="_blank" rel="noopener noreferrer" />}>
            <MessageCircle />
            Ajuda pelo WhatsApp
          </DropdownMenuItem>
        ) : null}
        {podeTrocarRestaurante ? (
          <DropdownMenuItem className="h-10" render={<Link href="/selecionar" />}>
            <ArrowLeftRight />
            Trocar restaurante
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className="h-10"
          variant="destructive"
          disabled={saindo}
          onClick={() => iniciar(() => sair())}
        >
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
