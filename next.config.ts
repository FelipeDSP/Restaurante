import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Raiz do projeto explícita (há um package-lock.json solto na pasta do usuário).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
