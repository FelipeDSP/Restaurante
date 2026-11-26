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

// Endereço público do site, para a imagem de compartilhamento sair com URL absoluta (as redes
// não seguem caminho relativo). Sem isto o Next avisava no build e usava `http://localhost:3000`,
// então quem mandava o link no WhatsApp não via imagem nenhuma.
//
// Vem da variável de build `NEXT_PUBLIC_SITE_URL` (o workflow da imagem já passa, e exige que
// esteja configurada). Esta página é estática, então o valor é gravado no build: trocar o domínio
// pede imagem nova. Os links de e-mail continuam em tempo de execução, por `origemDoSite()`.
const origem = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(origem),
  title: {
    template: "%s · uau foods",
    default: "uau foods · Sistema para espetinhos, hamburguerias e lanchonetes",
  },
  description:
    "Comanda no celular do garçom, delivery próprio com a sua marca e sem comissão, e caixa que fecha certo. Teste grátis por 14 dias.",
  applicationName: "uau foods",
  icons: { icon: "/marca/uau-icone.png", apple: "/marca/uau-icone.png" },
  // A imagem vem de `opengraph-image.tsx`, desenhada em 1200x630 (o arquivo da marca é 2717x932 e
  // tem fundo transparente: as redes cortavam e, no tema escuro, o marrom sumia).
  openGraph: {
    title: "uau foods",
    description: "Do pedido à brasa, sem papel e sem comissão.",
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
