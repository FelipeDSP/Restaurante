import {
  Bike,
  BookOpen,
  Boxes,
  ChartColumn,
  ChefHat,
  CookingPot,
  CreditCard,
  Grid2x2,
  History,
  House,
  LayoutGrid,
  type LucideIcon,
  MessageCircle,
  Printer,
  Settings,
  Store,
  TicketPercent,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

// O desenho de cada item do menu: na barra lateral, nas abas do rodapé e nos cartões de
// Configurações. Antes havia duas listas, uma pelo rótulo e outra pelo endereço, e o Estoque
// ficava sem ícone de um lado.
//
// O item da navegação guarda o **nome** e não o componente: o layout é de servidor e passa os
// itens para o menu, que é de cliente — e função não atravessa essa fronteira.
export const ICONES = {
  inicio: House,
  delivery: Bike,
  conversas: MessageCircle,
  mesas: LayoutGrid,
  setores: ChefHat,
  caixa: Wallet,
  cozinha: CookingPot,
  cardapio: BookOpen,
  estoque: Boxes,
  cupons: TicketPercent,
  entregadores: Truck,
  relatorios: ChartColumn,
  historico: History,
  restaurante: Store,
  "cadastro-mesas": Grid2x2,
  impressoras: Printer,
  equipe: Users,
  assinatura: CreditCard,
  configuracoes: Settings,
} satisfies Record<string, LucideIcon>;

export type NomeIcone = keyof typeof ICONES;

export function IconeNavegacao({ nome, className }: { nome: NomeIcone; className?: string }) {
  const Desenho = ICONES[nome];
  return <Desenho className={className} aria-hidden />;
}
