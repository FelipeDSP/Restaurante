// Cria um restaurante novo com a conta do dono (até existir o painel de super admin, fase 3).
//
// Uso, com as variáveis do Supabase de destino no ambiente ou no .env.local:
//   node --env-file=.env.local scripts/criar-restaurante.mjs \
//     --slug nome-do-restaurante --nome "Nome do Restaurante" \
//     --dono "Nome do Dono" --email dono@restaurante.com --senha "senha-forte-aqui" \
//     [--fuso America/Porto_Velho]
//
// Depois o dono entra no painel e cadastra marca, cardápio, mesas, bairros e equipe.
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

async function principal() {
  const { values: a } = parseArgs({
    options: {
      slug: { type: "string" },
      nome: { type: "string" },
      dono: { type: "string" },
      email: { type: "string" },
      senha: { type: "string" },
      fuso: { type: "string", default: "America/Porto_Velho" },
    },
  });

  const faltando = ["slug", "nome", "dono", "email", "senha"].filter((c) => !a[c]);
  if (faltando.length) return `Faltam parâmetros: ${faltando.map((c) => `--${c}`).join(", ")}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug) || a.slug.length < 3) {
    return "Slug inválido: use letras minúsculas, números e hífens (ex.: brasa-espetinhos).";
  }
  if (a.senha.length < 10) return "Use uma senha com pelo menos 10 caracteres.";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) return "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (ex.: --env-file=.env.local).";

  const supabase = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(`Supabase: ${url}`);

  // 0) Slug livre? (antes de criar qualquer conta, para não deixar conta órfã)
  const { data: existente } = await supabase.from("restaurantes").select("id").eq("slug", a.slug).maybeSingle();
  if (existente) return `Já existe um restaurante com o slug "${a.slug}".`;

  // 1) Conta do dono (reaproveita se o e-mail já existir, sem mexer na senha).
  let userId;
  const email = a.email.trim().toLowerCase();
  const { data: criado, error: erroUsuario } = await supabase.auth.admin.createUser({
    email,
    password: a.senha,
    email_confirm: true,
  });
  if (erroUsuario) {
    if (erroUsuario.code !== "email_exists") return `Não foi possível criar a conta: ${erroUsuario.message}`;
    const { data: idExistente } = await supabase.rpc("buscar_usuario_por_email", { p_email: email });
    if (!idExistente) return "E-mail já cadastrado, mas não foi possível localizar a conta.";
    userId = idExistente;
    console.log("Conta já existia: vinculando sem alterar a senha.");
  } else {
    userId = criado.user.id;
  }

  // 2) Restaurante (começa sem delivery; o dono configura horários e liga no painel).
  const { data: restaurante, error: erroRestaurante } = await supabase
    .from("restaurantes")
    .insert({ slug: a.slug, nome: a.nome, fuso_horario: a.fuso, aceita_delivery: false })
    .select("id, slug")
    .single();
  if (erroRestaurante) return `Não foi possível criar o restaurante: ${erroRestaurante.message}`;

  // 3) Vínculo do dono.
  const { error: erroMembro } = await supabase
    .from("membros")
    .insert({ restaurante_id: restaurante.id, user_id: userId, nome: a.dono, papel: "dono" });
  if (erroMembro) return `Restaurante criado, mas falhou o vínculo do dono: ${erroMembro.message}`;

  console.log("\nPronto!");
  console.log(`  Restaurante: ${a.nome} (id ${restaurante.id})`);
  console.log(`  Site de delivery: /${restaurante.slug}`);
  console.log(`  Login do dono: ${email} → /login`);
  return null;
}

// Sem process.exit(): no Windows ele pode derrubar o Node enquanto conexões ainda fecham.
const erro = await principal();
if (erro) {
  console.error(erro);
  process.exitCode = 1;
}
