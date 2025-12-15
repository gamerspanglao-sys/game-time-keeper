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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          timer_id: string
          timer_name: string
          timestamp: number
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          timer_id: string
          timer_name: string
          timestamp: number
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          timer_id?: string
          timer_name?: string
          timestamp?: number
        }
        Relationships: []
      }
      cash_expenses: {
        Row: {
          amount: number
          cash_register_id: string
          category: string
          created_at: string
          description: string | null
          id: string
        }
        Insert: {
          amount: number
          cash_register_id: string
          category: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Update: {
          amount?: number
          cash_register_id?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_expenses_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_register"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register: {
        Row: {
          actual_cash: number | null
          cost: number
          created_at: string
          date: string
          discrepancy: number | null
          expected_sales: number
          id: string
          notes: string | null
          opening_balance: number
          other_expenses: number
          purchases: number
          salaries: number
          updated_at: string
        }
        Insert: {
          actual_cash?: number | null
          cost?: number
          created_at?: string
          date: string
          discrepancy?: number | null
          expected_sales?: number
          id?: string
          notes?: string | null
          opening_balance?: number
          other_expenses?: number
          purchases?: number
          salaries?: number
          updated_at?: string
        }
        Update: {
          actual_cash?: number | null
          cost?: number
          created_at?: string
          date?: string
          discrepancy?: number | null
          expected_sales?: number
          id?: string
          notes?: string | null
          opening_balance?: number
          other_expenses?: number
          purchases?: number
          salaries?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          created_at: string
          id: string
          period_key: string
          timer_stats: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          period_key: string
          timer_stats?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          period_key?: string
          timer_stats?: Json
          updated_at?: string
        }
        Relationships: []
      }
      queue: {
        Row: {
          added_at: number
          created_at: string
          customer_name: string
          hours: number
          id: string
          timer_id: string
        }
        Insert: {
          added_at: number
          created_at?: string
          customer_name: string
          hours?: number
          id?: string
          timer_id: string
        }
        Update: {
          added_at?: number
          created_at?: string
          customer_name?: string
          hours?: number
          id?: string
          timer_id?: string
        }
        Relationships: []
      }
      timers: {
        Row: {
          category: string
          duration: number
          elapsed_time: number
          id: string
          name: string
          paid_amount: number
          remaining_at_start: number | null
          remaining_time: number
          start_time: number | null
          status: string
          unpaid_amount: number
          updated_at: string
        }
        Insert: {
          category: string
          duration?: number
          elapsed_time?: number
          id: string
          name: string
          paid_amount?: number
          remaining_at_start?: number | null
          remaining_time?: number
          start_time?: number | null
          status?: string
          unpaid_amount?: number
          updated_at?: string
        }
        Update: {
          category?: string
          duration?: number
          elapsed_time?: number
          id?: string
          name?: string
          paid_amount?: number
          remaining_at_start?: number | null
          remaining_time?: number
          start_time?: number | null
          status?: string
          unpaid_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
