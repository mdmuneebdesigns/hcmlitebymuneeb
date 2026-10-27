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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_logs: {
        Row: {
          answer: string | null
          created_at: string
          feature: string
          id: string
          latency_ms: number | null
          question: string | null
          success: boolean
          tool_calls: Json | null
          user_id: string | null
        }
        Insert: {
          answer?: string | null
          created_at?: string
          feature: string
          id?: string
          latency_ms?: number | null
          question?: string | null
          success?: boolean
          tool_calls?: Json | null
          user_id?: string | null
        }
        Update: {
          answer?: string | null
          created_at?: string
          feature?: string
          id?: string
          latency_ms?: number | null
          question?: string | null
          success?: boolean
          tool_calls?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          id: string
          posted_by: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          posted_by?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          posted_by?: string | null
          title?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in: string | null
          check_in_accuracy_m: number | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_method: string
          check_out: string | null
          check_out_accuracy_m: number | null
          check_out_lat: number | null
          check_out_lng: number | null
          created_at: string
          distance_m: number | null
          employee_id: string
          face_ok: boolean | null
          id: string
          status: string
          work_date: string
        }
        Insert: {
          check_in?: string | null
          check_in_accuracy_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_method?: string
          check_out?: string | null
          check_out_accuracy_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          distance_m?: number | null
          employee_id: string
          face_ok?: boolean | null
          id?: string
          status?: string
          work_date: string
        }
        Update: {
          check_in?: string | null
          check_in_accuracy_m?: number | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_method?: string
          check_out?: string | null
          check_out_accuracy_m?: number | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          distance_m?: number | null
          employee_id?: string
          face_ok?: boolean | null
          id?: string
          status?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          created_at: string
          decided_by: string | null
          decision_comment: string | null
          employee_id: string
          field: string
          id: string
          reason: string
          requested_time: string
          status: string
          work_date: string
        }
        Insert: {
          created_at?: string
          decided_by?: string | null
          decision_comment?: string | null
          employee_id: string
          field: string
          id?: string
          reason: string
          requested_time: string
          status?: string
          work_date: string
        }
        Update: {
          created_at?: string
          decided_by?: string | null
          decision_comment?: string | null
          employee_id?: string
          field?: string
          id?: string
          reason?: string
          requested_time?: string
          status?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          geofence_radius_m: number
          grace_minutes: number
          half_day_hours: number
          id: string
          late_penalty_days: number
          late_penalty_lates: number
          name: string
          office_lat: number
          office_lng: number
          office_start: string
          setup_complete: boolean
          weekend_days: string[]
        }
        Insert: {
          created_at?: string
          geofence_radius_m?: number
          grace_minutes?: number
          half_day_hours?: number
          id?: string
          late_penalty_days?: number
          late_penalty_lates?: number
          name: string
          office_lat?: number
          office_lng?: number
          office_start?: string
          setup_complete?: boolean
          weekend_days?: string[]
        }
        Update: {
          created_at?: string
          geofence_radius_m?: number
          grace_minutes?: number
          half_day_hours?: number
          id?: string
          late_penalty_days?: number
          late_penalty_lates?: number
          name?: string
          office_lat?: number
          office_lng?: number
          office_start?: string
          setup_complete?: boolean
          weekend_days?: string[]
        }
        Relationships: []
      }
      demo_events: {
        Row: {
          action: string
          created_at: string
          demo_id: string
          id: string
        }
        Insert: {
          action: string
          created_at?: string
          demo_id: string
          id?: string
        }
        Update: {
          action?: string
          created_at?: string
          demo_id?: string
          id?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      designations: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "designations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          basic_salary: number
          created_at: string
          department_id: string | null
          designation_id: string | null
          email: string
          employee_code: string
          exit_date: string | null
          face_descriptor: Json | null
          full_name: string
          gender: string | null
          id: string
          join_date: string
          must_change_password: boolean
          phone: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          basic_salary: number
          created_at?: string
          department_id?: string | null
          designation_id?: string | null
          email: string
          employee_code: string
          exit_date?: string | null
          face_descriptor?: Json | null
          full_name: string
          gender?: string | null
          id?: string
          join_date: string
          must_change_password?: boolean
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          basic_salary?: number
          created_at?: string
          department_id?: string | null
          designation_id?: string | null
          email?: string
          employee_code?: string
          exit_date?: string | null
          face_descriptor?: Json | null
          full_name?: string
          gender?: string | null
          id?: string
          join_date?: string
          must_change_password?: boolean
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_leads: {
        Row: {
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          inquiry_type: string
          message: string
          phone: string
          selected_plan: string | null
          status: string
          team_size: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          inquiry_type?: string
          message: string
          phone: string
          selected_plan?: string | null
          status?: string
          team_size?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          inquiry_type?: string
          message?: string
          phone?: string
          selected_plan?: string | null
          status?: string
          team_size?: string | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          reason: string
          start_date: string
          status: string
          working_days: number
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          reason: string
          start_date: string
          status?: string
          working_days: number
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          reason?: string
          start_date?: string
          status?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          annual_quota: number
          created_at: string
          id: string
          is_paid: boolean
          name: string
        }
        Insert: {
          annual_quota?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          name: string
        }
        Update: {
          annual_quota?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          period_month: number
          period_year: number
          status: string
          total_gross: number
          total_net: number
          working_days: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          period_month: number
          period_year: number
          status?: string
          total_gross?: number
          total_net?: number
          working_days: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          period_month?: number
          period_year?: number
          status?: string
          total_gross?: number
          total_net?: number
          working_days?: number
        }
        Relationships: []
      }
      payslips: {
        Row: {
          absence_deduction: number
          absent_days: number
          basic_salary: number
          employee_id: string
          gross_salary: number
          half_days: number
          id: string
          late_deduction: number
          lates: number
          net_pay: number
          per_day_rate: number
          present_days: number
          run_id: string
          tax: number
          unpaid_leave_days: number
          working_days: number
        }
        Insert: {
          absence_deduction?: number
          absent_days?: number
          basic_salary: number
          employee_id: string
          gross_salary: number
          half_days?: number
          id?: string
          late_deduction?: number
          lates?: number
          net_pay: number
          per_day_rate: number
          present_days?: number
          run_id: string
          tax?: number
          unpaid_leave_days?: number
          working_days: number
        }
        Update: {
          absence_deduction?: number
          absent_days?: number
          basic_salary?: number
          employee_id?: string
          gross_salary?: number
          half_days?: number
          id?: string
          late_deduction?: number
          lates?: number
          net_pay?: number
          per_day_rate?: number
          present_days?: number
          run_id?: string
          tax?: number
          unpaid_leave_days?: number
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_licenses: {
        Row: {
          activated_at: string | null
          assigned_company_name: string | null
          assigned_email: string | null
          bound_device_hash: string | null
          bound_device_info: string | null
          company_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_active_at: string | null
          license_key: string
          max_devices: number
          plan_type: string
          status: string
        }
        Insert: {
          activated_at?: string | null
          assigned_company_name?: string | null
          assigned_email?: string | null
          bound_device_hash?: string | null
          bound_device_info?: string | null
          company_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_active_at?: string | null
          license_key: string
          max_devices?: number
          plan_type: string
          status?: string
        }
        Update: {
          activated_at?: string | null
          assigned_company_name?: string | null
          assigned_email?: string | null
          bound_device_hash?: string | null
          bound_device_info?: string | null
          company_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_active_at?: string | null
          license_key?: string
          max_devices?: number
          plan_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_licenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "hr" | "employee"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "hr", "employee"],
    },
  },
} as const
