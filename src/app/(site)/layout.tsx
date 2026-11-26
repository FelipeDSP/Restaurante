import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Nunito } from "next/font/google";

import { origemDoSite } from "@/lib/url";

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

// `metadataBase` dá o endereço absoluto da imagem de compartilhamento (as redes não seguem caminho
// relativo). Sem ele o Next avisava no build e usava `http://localhost:3000`, então quem mandava o
// link no WhatsApp não via imagem nenhuma.
//
// Vem de `origemDoSite()`, a mesma origem dos links de e-mail: `SITE_URL` do Coolify, lida em tempo
// de execução, com o host da requisição como alternativa. Gravar no build pela variável
// `NEXT_PUBLIC_SITE_URL` sairia mais barato (a landing continuaria estática), mas ela é a antiga e
// estava apontando para um domínio que não existe mais — que é exatamente o erro consertado aqui.
// O preço é a landing passar a ser montada a cada visita: é uma página sem consulta a banco, e
// todas as outras deste grupo já são assim.
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await origemDoSite()),
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
}

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
