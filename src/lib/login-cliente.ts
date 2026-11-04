import "server-only";

// Conta do cliente do delivery: cadastro com nome, e-mail, celular e senha (sem captcha, sem SMS).
// Sempre disponível; pedir sem conta continua igual.
export function loginClienteDisponivel(): boolean {
  return true;
}
