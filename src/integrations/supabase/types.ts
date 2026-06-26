export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      amizades: {
        Row: {
          amigo_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amigo_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amigo_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conquistas_desbloqueadas: {
        Row: {
          conquista_id: string
          desbloqueada_em: string
          user_id: string
        }
        Insert: {
          conquista_id: string
          desbloqueada_em?: string
          user_id: string
        }
        Update: {
          conquista_id?: string
          desbloqueada_em?: string
          user_id?: string
        }
        Relationships: []
      }
      partida_online: {
        Row: {
          created_at: string
          encerrada: boolean
          fase: string
          id: string
          jogador1_id: string | null
          jogador2_id: string | null
          log_eventos: Json
          penaltis: Json | null
          placar1: number
          placar2: number
          rodada: number
          sala_id: string | null
          vencedor_id: string | null
        }
        Insert: {
          created_at?: string
          encerrada?: boolean
          fase?: string
          id?: string
          jogador1_id?: string | null
          jogador2_id?: string | null
          log_eventos?: Json
          penaltis?: Json | null
          placar1?: number
          placar2?: number
          rodada?: number
          sala_id?: string | null
          vencedor_id?: string | null
        }
        Update: {
          created_at?: string
          encerrada?: boolean
          fase?: string
          id?: string
          jogador1_id?: string | null
          jogador2_id?: string | null
          log_eventos?: Json
          penaltis?: Json | null
          placar1?: number
          placar2?: number
          rodada?: number
          sala_id?: string | null
          vencedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partida_online_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas: {
        Row: {
          campeao: boolean
          created_at: string
          elenco: Json
          estrategia: string
          fase_alcancada: string
          formacao: string
          id: string
          log: Json
          modo: string
          pontuacao: number
          user_id: string
        }
        Insert: {
          campeao?: boolean
          created_at?: string
          elenco?: Json
          estrategia: string
          fase_alcancada: string
          formacao: string
          id?: string
          log?: Json
          modo: string
          pontuacao?: number
          user_id: string
        }
        Update: {
          campeao?: boolean
          created_at?: string
          elenco?: Json
          estrategia?: string
          fase_alcancada?: string
          formacao?: string
          id?: string
          log?: Json
          modo?: string
          pontuacao?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          player_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          player_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sala_draft: {
        Row: {
          created_at: string
          escolhas: Json
          estrategia: string
          formacao_id: string
          id: string
          jogadores_oferecidos: Json | null
          nome_time: string
          nomes_escolhidos: string[]
          rerolls_restantes: number
          rodada_atual: number
          sala_id: string
          selecoes_oferecidas: string[]
          terminou: boolean
          trocas_restantes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          escolhas?: Json
          estrategia?: string
          formacao_id: string
          id?: string
          jogadores_oferecidos?: Json | null
          nome_time?: string
          nomes_escolhidos?: string[]
          rerolls_restantes?: number
          rodada_atual?: number
          sala_id: string
          selecoes_oferecidas?: string[]
          terminou?: boolean
          trocas_restantes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          escolhas?: Json
          estrategia?: string
          formacao_id?: string
          id?: string
          jogadores_oferecidos?: Json | null
          nome_time?: string
          nomes_escolhidos?: string[]
          rerolls_restantes?: number
          rodada_atual?: number
          sala_id?: string
          selecoes_oferecidas?: string[]
          terminou?: boolean
          trocas_restantes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sala_draft_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      sala_jogadores: {
        Row: {
          bandeira: string | null
          created_at: string
          elenco_online: Json | null
          eliminado_em: string | null
          fase_alcancada_torneio: string
          gols_contra: number
          gols_pro: number
          grupo: string | null
          id: string
          is_cpu: boolean
          last_seen_at: string
          nome: string
          pontos_grupo: number
          pronto: boolean
          sala_id: string
          slot: number
          user_id: string | null
        }
        Insert: {
          bandeira?: string | null
          created_at?: string
          elenco_online?: Json | null
          eliminado_em?: string | null
          fase_alcancada_torneio?: string
          gols_contra?: number
          gols_pro?: number
          grupo?: string | null
          id?: string
          is_cpu?: boolean
          last_seen_at?: string
          nome: string
          pontos_grupo?: number
          pronto?: boolean
          sala_id: string
          slot: number
          user_id?: string | null
        }
        Update: {
          bandeira?: string | null
          created_at?: string
          elenco_online?: Json | null
          eliminado_em?: string | null
          fase_alcancada_torneio?: string
          gols_contra?: number
          gols_pro?: number
          grupo?: string | null
          id?: string
          is_cpu?: boolean
          last_seen_at?: string
          nome?: string
          pontos_grupo?: number
          pronto?: boolean
          sala_id?: string
          slot?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sala_jogadores_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      salas: {
        Row: {
          codigo: string
          competicao: string
          created_at: string
          formacao_default: string
          id: string
          max_jogadores: number
          mestre_id: string
          modo: string
          status: string
          tipo_draft: string
          updated_at: string
          velocidade: string
        }
        Insert: {
          codigo: string
          competicao?: string
          created_at?: string
          formacao_default?: string
          id?: string
          max_jogadores?: number
          mestre_id: string
          modo?: string
          status?: string
          tipo_draft?: string
          updated_at?: string
          velocidade?: string
        }
        Update: {
          codigo?: string
          competicao?: string
          created_at?: string
          formacao_default?: string
          id?: string
          max_jogadores?: number
          mestre_id?: string
          modo?: string
          status?: string
          tipo_draft?: string
          updated_at?: string
          velocidade?: string
        }
        Relationships: []
      }
      stats_jogador: {
        Row: {
          campanhas_completas: number
          derrotas: number
          disputas_penaltis: number
          drafts_modo_almanaque: number
          drafts_modo_classico: number
          empates: number
          formacoes_distintas_usadas: string[]
          goleadas_5_mais: number
          gols_marcados: number
          gols_sofridos: number
          improvisacoes_total: number
          jogadores_lendarios_escalados: number
          jogos_sem_sofrer_gol: number
          partidas_jogadas: number
          penaltis_vencidos: number
          rerolls_usados: number
          selecoes_distintas_usadas: string[]
          sequencia_invicta_atual: number
          sequencia_invicta_recorde: number
          sequencia_vitorias_atual: number
          sequencia_vitorias_recorde: number
          titulos: number
          trocas_usadas: number
          updated_at: string
          user_id: string
          vitorias: number
        }
        Insert: {
          campanhas_completas?: number
          derrotas?: number
          disputas_penaltis?: number
          drafts_modo_almanaque?: number
          drafts_modo_classico?: number
          empates?: number
          formacoes_distintas_usadas?: string[]
          goleadas_5_mais?: number
          gols_marcados?: number
          gols_sofridos?: number
          improvisacoes_total?: number
          jogadores_lendarios_escalados?: number
          jogos_sem_sofrer_gol?: number
          partidas_jogadas?: number
          penaltis_vencidos?: number
          rerolls_usados?: number
          selecoes_distintas_usadas?: string[]
          sequencia_invicta_atual?: number
          sequencia_invicta_recorde?: number
          sequencia_vitorias_atual?: number
          sequencia_vitorias_recorde?: number
          titulos?: number
          trocas_usadas?: number
          updated_at?: string
          user_id: string
          vitorias?: number
        }
        Update: {
          campanhas_completas?: number
          derrotas?: number
          disputas_penaltis?: number
          drafts_modo_almanaque?: number
          drafts_modo_classico?: number
          empates?: number
          formacoes_distintas_usadas?: string[]
          goleadas_5_mais?: number
          gols_marcados?: number
          gols_sofridos?: number
          improvisacoes_total?: number
          jogadores_lendarios_escalados?: number
          jogos_sem_sofrer_gol?: number
          partidas_jogadas?: number
          penaltis_vencidos?: number
          rerolls_usados?: number
          selecoes_distintas_usadas?: string[]
          sequencia_invicta_atual?: number
          sequencia_invicta_recorde?: number
          sequencia_vitorias_atual?: number
          sequencia_vitorias_recorde?: number
          titulos?: number
          trocas_usadas?: number
          updated_at?: string
          user_id?: string
          vitorias?: number
        }
        Relationships: []
      }
      torneio_online: {
        Row: {
          chaveamento: Json
          classificacao_grupos: Json
          created_at: string
          fase_atual: string
          grupos: Json
          id: string
          rodada_grupos_atual: number
          sala_id: string
          updated_at: string
        }
        Insert: {
          chaveamento?: Json
          classificacao_grupos?: Json
          created_at?: string
          fase_atual?: string
          grupos?: Json
          id?: string
          rodada_grupos_atual?: number
          sala_id: string
          updated_at?: string
        }
        Update: {
          chaveamento?: Json
          classificacao_grupos?: Json
          created_at?: string
          fase_atual?: string
          grupos?: Json
          id?: string
          rodada_grupos_atual?: number
          sala_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "torneio_online_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: true
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gerar_player_id: { Args: never; Returns: string }
      is_amigo_aceito: { Args: { _a: string; _b: string }; Returns: boolean }
      is_membro_sala: {
        Args: { _sala_id: string; _user_id: string }
        Returns: boolean
      }
      is_mestre_sala: {
        Args: { _sala_id: string; _user_id: string }
        Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
