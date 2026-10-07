import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Nunito } from "next/font/google";

// Páginas do PRODUTO (marca uau foods). As telas dos restaurantes ficam fora deste grupo e
// continuam white label.

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · uau foods",
    default: "uau foods · Sistema para espetinhos, hamburguerias e lanchonetes",
  },
  description:
    "Comanda no celular do garçom, delivery próprio com a sua marca e sem comissão, e caixa que fecha certo. Teste grátis por 14 dias.",
  applicationName: "uau foods",
  icons: { icon: "/marca/uau-icone.png", apple: "/marca/uau-icone.png" },
  openGraph: {
    title: "uau foods",
    description: "Do pedido à brasa, sem papel e sem comissão.",
    images: ["/marca/uau-foods.png"],
    locale: "pt_BR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#2b1a12",
  width: "device-width",
  initialScale: 1,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${nunito.variable} ${plexMono.variable} flex flex-1 flex-col bg-uau-creme font-uau text-uau-marrom`}>
      {children}
    </div>
  );
}
