import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// White label: sem nome da plataforma. Cada área define o título com a marca do restaurante.
export const metadata: Metadata = {
  title: "Cardápio",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        {/* Embaixo, acima das barras fixas (garçom, carrinho): no topo cobria o voltar, o menu e a faixa de conexão. */}
        <Toaster position="bottom-center" offset={{ bottom: 144 }} mobileOffset={{ bottom: 144 }} richColors />
      </body>
    </html>
  );
}
