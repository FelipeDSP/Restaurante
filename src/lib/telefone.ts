// Telefone do Brasil: o cliente digita com DDD ("(69) 99999-1234"); o Auth guarda com o 55.

// Só dígitos com o 55 na frente, ou null se não parecer um telefone com DDD.
export function telefoneComPais(texto: string): string | null {
  let digitos = texto.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (!/^55\d{10,11}$/.test(digitos)) return null;
  return digitos;
}

// "5569999991234" -> "(69) 99999-1234"
export function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}
