import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a todas as respostas.
const cabecalhosSeguranca = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // O app não deve ser embutido em iframes de outros sites (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Build autocontido para a imagem Docker (deploy na VPS, não na Vercel).
  output: "standalone",
  // Não anunciar a tecnologia/plataforma (white label).
  poweredByHeader: false,
  // Raiz do projeto explícita (há um package-lock.json solto na pasta do usuário).
  turbopack: {
    root: __dirname,
  },
  // Só em `next dev`: permite testar pelo celular na mesma rede (ex.: http://192.168.1.37:3000).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosSeguranca }];
  },
};

export default nextConfig;
