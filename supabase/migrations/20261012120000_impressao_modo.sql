-- Como a impressora recebe o ticket:
--   escpos: comandos de impressora térmica (ESC/POS), direto pela rede ou pela fila RAW do Windows.
--   driver: o app desenha o ticket e imprime pelo driver do Windows (qualquer impressora instalada).
alter table public.impressoras
  add column modo text not null default 'escpos' check (modo in ('escpos', 'driver'));

alter table public.impressoras
  add constraint impressoras_driver_so_no_windows check (modo = 'escpos' or conexao = 'windows');

-- Novas rotas fixas: /cozinha (tela da cozinha) e /downloads (app de impressão).
create or replace function rest_privado.slug_reservado(p_slug text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_slug = any (array[
    -- app
    'login', 'entrar', 'sair', 'painel', 'garcom', 'inicio', 'selecionar', 'sem-acesso',
    'cadastro', 'comecar', 'auth', 'api', 'pwa', 'pedido', 'static', 'public',
    'robots', 'sitemap', 'favicon', 'icon', 'manifest', 'marca',
    'cozinha', 'downloads', 'download',
    -- produto
    'admin', 'app', 'www', 'planos', 'precos', 'assinatura', 'assinar', 'termos',
    'privacidade', 'ajuda', 'suporte', 'contato', 'sobre', 'blog', 'status', 'docs',
    'conta', 'minha-conta', 'configuracoes', 'recuperar-senha', 'nova-senha',
    'webhook', 'webhooks', 'kiwify', 'uau', 'uaufoods', 'uau-foods'
  ]);
$$;
