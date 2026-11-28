export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_gateway_state: {
        Row: {
          created_at: string;
          model_id: string;
          reason: string;
        };
        Insert: {
          created_at?: string;
          model_id: string;
          reason: string;
        };
        Update: {
          created_at?: string;
          model_id?: string;
          reason?: string;
        };
        Relationships: [];
      };
      applications: {
        Row: {
          amount: string;
          created_at: string;
          funder: string;
          grant_id: string;
          id: string;
          name: string;
          narrative: string;
          status: string;
          user_id: string;
        };
        Insert: {
          amount: string;
          created_at?: string;
          funder: string;
          grant_id: string;
          id?: string;
          name: string;
          narrative?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          amount?: string;
          created_at?: string;
          funder?: string;
          grant_id?: string;
          id?: string;
          name?: string;
          narrative?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          autopilot: boolean;
          created_at: string;
          demographics: string[];
          email: string | null;
          entity_type: string;
          funding_goal: string;
          funding_purpose: string;
          id: string;
          industry: string;
          lifecycle_stage: string;
          location: string;
          onboarded: boolean;
          project_name: string;
          sector_code: string;
          updated_at: string;
          voice_profile: string;
          voice_sample: string;
        };
        Insert: {
          autopilot?: boolean;
          created_at?: string;
          demographics?: string[];
          email?: string | null;
          entity_type?: string;
          funding_goal?: string;
          funding_purpose?: string;
          id: string;
          industry?: string;
          lifecycle_stage?: string;
          location?: string;
          onboarded?: boolean;
          project_name?: string;
          sector_code?: string;
          updated_at?: string;
          voice_profile?: string;
          voice_sample?: string;
        };
        Update: {
          autopilot?: boolean;
          created_at?: string;
          demographics?: string[];
          email?: string | null;
          entity_type?: string;
          funding_goal?: string;
          funding_purpose?: string;
          id?: string;
          industry?: string;
          lifecycle_stage?: string;
          location?: string;
          onboarded?: boolean;
          project_name?: string;
          sector_code?: string;
          updated_at?: string;
          voice_profile?: string;
          voice_sample?: string;
        };
        Relationships: [];
      };
      vault_documents: {
        Row: {
          category_tag: "legal_tax" | "license_permit" | "vendor_quote" | "financial" | null;
          created_at: string;
          file_name: string;
          grant_id: string | null;
          id: string;
          mime_type: string;
          size_bytes: number;
          slot_key: string;
          storage_path: string;
          user_id: string;
        };
        Insert: {
          category_tag?: "legal_tax" | "license_permit" | "vendor_quote" | "financial" | null;
          created_at?: string;
          file_name: string;
          grant_id?: string | null;
          id?: string;
          mime_type: string;
          size_bytes: number;
          slot_key: string;
          storage_path: string;
          user_id: string;
        };
        Update: {
          category_tag?: "legal_tax" | "license_permit" | "vendor_quote" | "financial" | null;
          created_at?: string;
          file_name?: string;
          grant_id?: string | null;
          id?: string;
          mime_type?: string;
          size_bytes?: number;
          slot_key?: string;
          storage_path?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
