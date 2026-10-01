// Sobe o Next.js apontando para o Supabase local (Docker), ignorando o .env.local.
// Uso: npm run dev:local [-- --port 3200]
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const status = execSync("npx supabase status -o env", { encoding: "utf8" });
const valores = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((linha) => linha.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

if (!valores.API_URL || !valores.PUBLISHABLE_KEY) {
  console.error("Supabase local não está rodando. Rode: npx supabase start");
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: valores.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valores.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: valores.SECRET_KEY,
};

console.log(`Usando Supabase local em ${valores.API_URL}`);
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const filho = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], { env, stdio: "inherit" });
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
