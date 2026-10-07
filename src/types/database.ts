
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "assinaturas": {
                  Row: {
                    "atualizado_em": string,"criado_em": string,"id": string,"periodo_termina_em": string | null,"plano": string,"provedor": string | null,"provedor_assinatura_id": string | null,"restaurante_id": string,"status": string,"teste_termina_em": string | null
                  }
                  Insert: {
                    "atualizado_em"?: string,"criado_em"?: string,"id"?: string,"periodo_termina_em"?: string | null,"plano"?: string,"provedor"?: string | null,"provedor_assinatura_id"?: string | null,"restaurante_id": string,"status"?: string,"teste_termina_em"?: string | null
                  }
                  Update: {
                    "atualizado_em"?: string,"criado_em"?: string,"id"?: string,"periodo_termina_em"?: string | null,"plano"?: string,"provedor"?: string | null,"provedor_assinatura_id"?: string | null,"restaurante_id"?: string,"status"?: string,"teste_termina_em"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assinaturas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: true
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assinaturas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: true
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"bairros_entrega": {
                  Row: {
                    "ativo": boolean,"id": string,"nome": string,"restaurante_id": string,"taxa": number
                  }
                  Insert: {
                    "ativo"?: boolean,"id"?: string,"nome": string,"restaurante_id": string,"taxa"?: number
                  }
                  Update: {
                    "ativo"?: boolean,"id"?: string,"nome"?: string,"restaurante_id"?: string,"taxa"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bairros_entrega_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bairros_entrega_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"caixa_sessoes": {
                  Row: {
                    "aberta_em": string,"aberta_por": string,"fechada_em": string | null,"fechada_por": string | null,"id": string,"observacao": string | null,"restaurante_id": string,"ultimo_numero_pedido": number,"valor_contado": number | null,"valor_inicial": number
                  }
                  Insert: {
                    "aberta_em"?: string,"aberta_por": string,"fechada_em"?: string | null,"fechada_por"?: string | null,"id"?: string,"observacao"?: string | null,"restaurante_id": string,"ultimo_numero_pedido"?: number,"valor_contado"?: number | null,"valor_inicial"?: number
                  }
                  Update: {
                    "aberta_em"?: string,"aberta_por"?: string,"fechada_em"?: string | null,"fechada_por"?: string | null,"id"?: string,"observacao"?: string | null,"restaurante_id"?: string,"ultimo_numero_pedido"?: number,"valor_contado"?: number | null,"valor_inicial"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "caixa_sessoes_restaurante_id_aberta_por_fkey"
      columns: ["restaurante_id","aberta_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "caixa_sessoes_restaurante_id_fechada_por_fkey"
      columns: ["restaurante_id","fechada_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "caixa_sessoes_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "caixa_sessoes_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"categorias": {
                  Row: {
                    "ativa": boolean,"id": string,"nome": string,"ordem": number,"restaurante_id": string
                  }
                  Insert: {
                    "ativa"?: boolean,"id"?: string,"nome": string,"ordem"?: number,"restaurante_id": string
                  }
                  Update: {
                    "ativa"?: boolean,"id"?: string,"nome"?: string,"ordem"?: number,"restaurante_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categorias_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categorias_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"comandas": {
                  Row: {
                    "aberta_em": string,"caixa_sessao_id": string,"fechada_em": string | null,"fechada_por": string | null,"garcom_id": string | null,"id": string,"mesa_id": string,"pessoas": number | null,"restaurante_id": string,"status": string,"total": number
                  }
                  Insert: {
                    "aberta_em"?: string,"caixa_sessao_id": string,"fechada_em"?: string | null,"fechada_por"?: string | null,"garcom_id"?: string | null,"id"?: string,"mesa_id": string,"pessoas"?: number | null,"restaurante_id": string,"status"?: string,"total"?: number
                  }
                  Update: {
                    "aberta_em"?: string,"caixa_sessao_id"?: string,"fechada_em"?: string | null,"fechada_por"?: string | null,"garcom_id"?: string | null,"id"?: string,"mesa_id"?: string,"pessoas"?: number | null,"restaurante_id"?: string,"status"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "comandas_restaurante_id_caixa_sessao_id_fkey"
      columns: ["restaurante_id","caixa_sessao_id"]
isOneToOne: false
      referencedRelation: "caixa_sessoes"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "comandas_restaurante_id_fechada_por_fkey"
      columns: ["restaurante_id","fechada_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "comandas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comandas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comandas_restaurante_id_garcom_id_fkey"
      columns: ["restaurante_id","garcom_id"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "comandas_restaurante_id_mesa_id_fkey"
      columns: ["restaurante_id","mesa_id"]
isOneToOne: false
      referencedRelation: "mesas"
      referencedColumns: ["restaurante_id","id"]
    }
                  ]
                },"itens_pedido": {
                  Row: {
                    "cancelado_em": string | null,"cancelado_por": string | null,"criado_em": string,"id": string,"motivo_cancelamento": string | null,"nome_produto": string,"observacao": string | null,"pedido_id": string,"preco_unitario": number,"produto_id": string,"quantidade": number,"restaurante_id": string,"total": number
                  }
                  Insert: {
                    "cancelado_em"?: string | null,"cancelado_por"?: string | null,"criado_em"?: string,"id"?: string,"motivo_cancelamento"?: string | null,"nome_produto": string,"observacao"?: string | null,"pedido_id": string,"preco_unitario": number,"produto_id": string,"quantidade": number,"restaurante_id": string,"total"?: number
                  }
                  Update: {
                    "cancelado_em"?: string | null,"cancelado_por"?: string | null,"criado_em"?: string,"id"?: string,"motivo_cancelamento"?: string | null,"nome_produto"?: string,"observacao"?: string | null,"pedido_id"?: string,"preco_unitario"?: number,"produto_id"?: string,"quantidade"?: number,"restaurante_id"?: string,"total"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "itens_pedido_restaurante_id_cancelado_por_fkey"
      columns: ["restaurante_id","cancelado_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "itens_pedido_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itens_pedido_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itens_pedido_restaurante_id_pedido_id_fkey"
      columns: ["restaurante_id","pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "itens_pedido_restaurante_id_produto_id_fkey"
      columns: ["restaurante_id","produto_id"]
isOneToOne: false
      referencedRelation: "produtos"
      referencedColumns: ["restaurante_id","id"]
    }
                  ]
                },"membros": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"id": string,"nome": string,"papel": string,"restaurante_id": string,"user_id": string
                  }
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome": string,"papel": string,"restaurante_id": string,"user_id": string
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"id"?: string,"nome"?: string,"papel"?: string,"restaurante_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membros_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membros_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"mesas": {
                  Row: {
                    "ativa": boolean,"id": string,"numero": string,"ordem": number,"restaurante_id": string
                  }
                  Insert: {
                    "ativa"?: boolean,"id"?: string,"numero": string,"ordem"?: number,"restaurante_id": string
                  }
                  Update: {
                    "ativa"?: boolean,"id"?: string,"numero"?: string,"ordem"?: number,"restaurante_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mesas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mesas_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"pagamentos": {
                  Row: {
                    "caixa_sessao_id": string,"comanda_id": string | null,"criado_em": string,"estornado_em": string | null,"estornado_por": string | null,"forma": string,"id": string,"pedido_id": string | null,"registrado_por": string,"restaurante_id": string,"valor": number
                  }
                  Insert: {
                    "caixa_sessao_id": string,"comanda_id"?: string | null,"criado_em"?: string,"estornado_em"?: string | null,"estornado_por"?: string | null,"forma": string,"id"?: string,"pedido_id"?: string | null,"registrado_por": string,"restaurante_id": string,"valor": number
                  }
                  Update: {
                    "caixa_sessao_id"?: string,"comanda_id"?: string | null,"criado_em"?: string,"estornado_em"?: string | null,"estornado_por"?: string | null,"forma"?: string,"id"?: string,"pedido_id"?: string | null,"registrado_por"?: string,"restaurante_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pagamentos_restaurante_id_caixa_sessao_id_fkey"
      columns: ["restaurante_id","caixa_sessao_id"]
isOneToOne: false
      referencedRelation: "caixa_sessoes"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pagamentos_restaurante_id_comanda_id_fkey"
      columns: ["restaurante_id","comanda_id"]
isOneToOne: false
      referencedRelation: "comandas"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pagamentos_restaurante_id_estornado_por_fkey"
      columns: ["restaurante_id","estornado_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pagamentos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pagamentos_restaurante_id_pedido_id_fkey"
      columns: ["restaurante_id","pedido_id"]
isOneToOne: false
      referencedRelation: "pedidos"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pagamentos_restaurante_id_registrado_por_fkey"
      columns: ["restaurante_id","registrado_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    }
                  ]
                },"pedidos": {
                  Row: {
                    "bairro_id": string | null,"caixa_sessao_id": string,"cancelado_em": string | null,"cancelado_por": string | null,"cliente_nome": string | null,"cliente_telefone": string | null,"comanda_id": string | null,"criado_em": string,"criado_por": string | null,"endereco": Json | null,"forma_pagamento_prevista": string | null,"id": string,"motivo_cancelamento": string | null,"numero": number,"observacao": string | null,"origem": string,"restaurante_id": string,"status": string,"subtotal": number,"taxa_entrega": number,"total": number,"troco_para": number | null
                  }
                  Insert: {
                    "bairro_id"?: string | null,"caixa_sessao_id": string,"cancelado_em"?: string | null,"cancelado_por"?: string | null,"cliente_nome"?: string | null,"cliente_telefone"?: string | null,"comanda_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"endereco"?: Json | null,"forma_pagamento_prevista"?: string | null,"id"?: string,"motivo_cancelamento"?: string | null,"numero": number,"observacao"?: string | null,"origem": string,"restaurante_id": string,"status"?: string,"subtotal"?: number,"taxa_entrega"?: number,"total"?: number,"troco_para"?: number | null
                  }
                  Update: {
                    "bairro_id"?: string | null,"caixa_sessao_id"?: string,"cancelado_em"?: string | null,"cancelado_por"?: string | null,"cliente_nome"?: string | null,"cliente_telefone"?: string | null,"comanda_id"?: string | null,"criado_em"?: string,"criado_por"?: string | null,"endereco"?: Json | null,"forma_pagamento_prevista"?: string | null,"id"?: string,"motivo_cancelamento"?: string | null,"numero"?: number,"observacao"?: string | null,"origem"?: string,"restaurante_id"?: string,"status"?: string,"subtotal"?: number,"taxa_entrega"?: number,"total"?: number,"troco_para"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pedidos_restaurante_id_bairro_id_fkey"
      columns: ["restaurante_id","bairro_id"]
isOneToOne: false
      referencedRelation: "bairros_entrega"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pedidos_restaurante_id_caixa_sessao_id_fkey"
      columns: ["restaurante_id","caixa_sessao_id"]
isOneToOne: false
      referencedRelation: "caixa_sessoes"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pedidos_restaurante_id_cancelado_por_fkey"
      columns: ["restaurante_id","cancelado_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pedidos_restaurante_id_comanda_id_fkey"
      columns: ["restaurante_id","comanda_id"]
isOneToOne: false
      referencedRelation: "comandas"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pedidos_restaurante_id_criado_por_fkey"
      columns: ["restaurante_id","criado_por"]
isOneToOne: false
      referencedRelation: "membros"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "pedidos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pedidos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"produtos": {
                  Row: {
                    "categoria_id": string,"criado_em": string,"descricao": string | null,"disponivel": boolean,"disponivel_delivery": boolean,"foto_url": string | null,"id": string,"nome": string,"ordem": number,"preco": number,"restaurante_id": string
                  }
                  Insert: {
                    "categoria_id": string,"criado_em"?: string,"descricao"?: string | null,"disponivel"?: boolean,"disponivel_delivery"?: boolean,"foto_url"?: string | null,"id"?: string,"nome": string,"ordem"?: number,"preco": number,"restaurante_id": string
                  }
                  Update: {
                    "categoria_id"?: string,"criado_em"?: string,"descricao"?: string | null,"disponivel"?: boolean,"disponivel_delivery"?: boolean,"foto_url"?: string | null,"id"?: string,"nome"?: string,"ordem"?: number,"preco"?: number,"restaurante_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "produtos_restaurante_id_categoria_id_fkey"
      columns: ["restaurante_id","categoria_id"]
isOneToOne: false
      referencedRelation: "categorias"
      referencedColumns: ["restaurante_id","id"]
    },{
      foreignKeyName: "produtos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "produtos_restaurante_id_fkey"
      columns: ["restaurante_id"]
isOneToOne: false
      referencedRelation: "restaurantes_publicos"
      referencedColumns: ["id"]
    }
                  ]
                },"restaurantes": {
                  Row: {
                    "aceita_delivery": boolean,"ativo": boolean,"cor_primaria": string,"cor_secundaria": string,"criado_em": string,"endereco": NonNullable<Json>,"excluido_em": string | null,"fuso_horario": string,"horarios": NonNullable<Json>,"id": string,"logo_url": string | null,"nome": string,"pedido_minimo": number,"slug": string,"telefone": string | null,"tempo_estimado_entrega_min": number | null,"whatsapp": string | null
                  }
                  Insert: {
                    "aceita_delivery"?: boolean,"ativo"?: boolean,"cor_primaria"?: string,"cor_secundaria"?: string,"criado_em"?: string,"endereco"?: NonNullable<Json>,"excluido_em"?: string | null,"fuso_horario"?: string,"horarios"?: NonNullable<Json>,"id"?: string,"logo_url"?: string | null,"nome": string,"pedido_minimo"?: number,"slug": string,"telefone"?: string | null,"tempo_estimado_entrega_min"?: number | null,"whatsapp"?: string | null
                  }
                  Update: {
                    "aceita_delivery"?: boolean,"ativo"?: boolean,"cor_primaria"?: string,"cor_secundaria"?: string,"criado_em"?: string,"endereco"?: NonNullable<Json>,"excluido_em"?: string | null,"fuso_horario"?: string,"horarios"?: NonNullable<Json>,"id"?: string,"logo_url"?: string | null,"nome"?: string,"pedido_minimo"?: number,"slug"?: string,"telefone"?: string | null,"tempo_estimado_entrega_min"?: number | null,"whatsapp"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "restaurantes_publicos": {
                  Row: {
                    "aceita_delivery": boolean | null,"cor_primaria": string | null,"cor_secundaria": string | null,"endereco": Json | null,"fuso_horario": string | null,"horarios": Json | null,"id": string | null,"logo_url": string | null,"nome": string | null,"pedido_minimo": number | null,"slug": string | null,"telefone": string | null,"tempo_estimado_entrega_min": number | null,"whatsapp": string | null
                  }
                  Insert: {
                           "aceita_delivery"?: boolean | null,"cor_primaria"?: string | null,"cor_secundaria"?: string | null,"endereco"?: Json | null,"fuso_horario"?: string | null,"horarios"?: Json | null,"id"?: string | null,"logo_url"?: string | null,"nome"?: string | null,"pedido_minimo"?: number | null,"slug"?: string | null,"telefone"?: string | null,"tempo_estimado_entrega_min"?: number | null,"whatsapp"?: string | null
                         }
                        Update: {
                           "aceita_delivery"?: boolean | null,"cor_primaria"?: string | null,"cor_secundaria"?: string | null,"endereco"?: Json | null,"fuso_horario"?: string | null,"horarios"?: Json | null,"id"?: string | null,"logo_url"?: string | null,"nome"?: string | null,"pedido_minimo"?: number | null,"slug"?: string | null,"telefone"?: string | null,"tempo_estimado_entrega_min"?: number | null,"whatsapp"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "buscar_usuario_por_email":
{ Args: { "p_email": string }; Returns: string
                           },
"consultar_disponibilidade_delivery":
{ Args: { "p_restaurante_id": string }; Returns: Json
                           },
"consultar_pedido_publico":
{ Args: { "p_pedido_id": string }; Returns: Json
                           },
"contar_restaurantes_do_usuario":
{ Args: { "p_user_id": string }; Returns: number
                           },
"criar_meu_restaurante":
{ Args: { "p_cor_primaria"?: string,"p_cor_secundaria"?: string,"p_fuso": string,"p_nome": string,"p_nome_dono": string,"p_slug": string,"p_whatsapp"?: string }; Returns: string
                           },
"criar_pedido_delivery":
{ Args: { "p_bairro_id": string,"p_cliente_nome": string,"p_cliente_telefone": string,"p_endereco": Json,"p_forma_pagamento": string,"p_itens": Json,"p_observacao"?: string,"p_restaurante_id": string,"p_troco_para"?: number }; Returns: Json
                           },
"entregar_pedido_delivery":
{ Args: { "p_forma": string,"p_pedido_id": string }; Returns: undefined
                           },
"lancar_itens_comanda":
{ Args: { "p_comanda_id": string,"p_itens": Json }; Returns: Json
                           },
"resumo_caixa_sessao":
{ Args: { "p_sessao_id": string }; Returns: Json
                           },
"slug_disponivel":
{ Args: { "p_slug": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
