import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

const ROTAS_STAFF = ["/painel", "/garcom", "/inicio", "/selecionar", "/sem-acesso", "/comecar", "/cozinha", "/nova-senha"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Não colocar código entre a criação do cliente e getClaims():
  // é aqui que o token é validado e renovado.
  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims);

  // Checagem otimista. A autorização real (membro, papel) é feita no servidor e na RLS.
  const { pathname } = request.nextUrl;
  if (!logado && ROTAS_STAFF.some((rota) => pathname.startsWith(rota))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
