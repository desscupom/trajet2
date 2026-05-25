export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      comments: {
        Row: { body: string; created_at: string; entity_id: string; entity_type: string; id: string; profile_id: string; trip_id: string; updated_at: string }
        Insert: { body: string; created_at?: string; entity_id: string; entity_type: string; id?: string; profile_id: string; trip_id: string; updated_at?: string }
        Update: { body?: string; created_at?: string; entity_id?: string; entity_type?: string; id?: string; profile_id?: string; trip_id?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "comments_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "comments_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      cover_photo_cache: {
        Row: { fetched_at: string; hit_count: number; keyword: string; photo_urls: Json; source: string }
        Insert: { fetched_at?: string; hit_count?: number; keyword: string; photo_urls: Json; source?: string }
        Update: { fetched_at?: string; hit_count?: number; keyword?: string; photo_urls?: Json; source?: string }
        Relationships: []
      }
      documents: {
        Row: { created_at: string; file_url: string | null; id: string; kind: string; parsed_data: Json | null; title: string; trip_id: string; uploaded_by: string }
        Insert: { created_at?: string; file_url?: string | null; id?: string; kind: string; parsed_data?: Json | null; title: string; trip_id: string; uploaded_by: string }
        Update: { created_at?: string; file_url?: string | null; id?: string; kind?: string; parsed_data?: Json | null; title?: string; trip_id?: string; uploaded_by?: string }
        Relationships: [{ foreignKeyName: "documents_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }, { foreignKeyName: "documents_uploaded_by_fkey"; columns: ["uploaded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      expense_categories: {
        Row: { created_at: string; created_by: string | null; icon_name: string; id: string; label: string; slug: string; trip_id: string }
        Insert: { created_at?: string; created_by?: string | null; icon_name?: string; id?: string; label: string; slug: string; trip_id: string }
        Update: { created_at?: string; created_by?: string | null; icon_name?: string; id?: string; label?: string; slug?: string; trip_id?: string }
        Relationships: [{ foreignKeyName: "expense_categories_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "expense_categories_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      expense_shares: {
        Row: { expense_id: string; id: string; member_id: string; share_amount: number }
        Insert: { expense_id: string; id?: string; member_id: string; share_amount: number }
        Update: { expense_id?: string; id?: string; member_id?: string; share_amount?: number }
        Relationships: [{ foreignKeyName: "expense_shares_expense_id_fkey"; columns: ["expense_id"]; isOneToOne: false; referencedRelation: "expenses"; referencedColumns: ["id"] }, { foreignKeyName: "expense_shares_member_id_fkey"; columns: ["member_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      expenses: {
        Row: { amount: number; amount_in_base: number; category: string | null; created_at: string; currency: string; description: string; exchange_rate: number; expense_date: string; id: string; itinerary_item_id: string | null; paid_by: string; trip_id: string }
        Insert: { amount: number; amount_in_base: number; category?: string | null; created_at?: string; currency: string; description: string; exchange_rate: number; expense_date?: string; id?: string; itinerary_item_id?: string | null; paid_by: string; trip_id: string }
        Update: { amount?: number; amount_in_base?: number; category?: string | null; created_at?: string; currency?: string; description?: string; exchange_rate?: number; expense_date?: string; id?: string; itinerary_item_id?: string | null; paid_by?: string; trip_id?: string }
        Relationships: [{ foreignKeyName: "expenses_paid_by_fkey"; columns: ["paid_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "expenses_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      geo_reminders: {
        Row: { active: boolean; body: string | null; created_at: string; id: string; latitude: number; longitude: number; notified_at: string | null; place_name: string | null; profile_id: string; radius_m: number; repeat: boolean; title: string; trigger_on: string; trip_id: string | null; updated_at: string }
        Insert: { active?: boolean; body?: string | null; created_at?: string; id?: string; latitude: number; longitude: number; notified_at?: string | null; place_name?: string | null; profile_id: string; radius_m?: number; repeat?: boolean; title: string; trigger_on?: string; trip_id?: string | null; updated_at?: string }
        Update: { active?: boolean; body?: string | null; created_at?: string; id?: string; latitude?: number; longitude?: number; notified_at?: string | null; place_name?: string | null; profile_id?: string; radius_m?: number; repeat?: boolean; title?: string; trigger_on?: string; trip_id?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "geo_reminders_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "geo_reminders_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      itinerary_items: {
        Row: { created_at: string; created_by: string | null; custom_title: string | null; duration_minutes: number | null; id: string; notes: string | null; place_id: string | null; position: number; start_time: string | null; trip_day_id: string }
        Insert: { created_at?: string; created_by?: string | null; custom_title?: string | null; duration_minutes?: number | null; id?: string; notes?: string | null; place_id?: string | null; position?: number; start_time?: string | null; trip_day_id: string }
        Update: { created_at?: string; created_by?: string | null; custom_title?: string | null; duration_minutes?: number | null; id?: string; notes?: string | null; place_id?: string | null; position?: number; start_time?: string | null; trip_day_id?: string }
        Relationships: [{ foreignKeyName: "itinerary_items_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "itinerary_items_place_id_fkey"; columns: ["place_id"]; isOneToOne: false; referencedRelation: "places"; referencedColumns: ["id"] }, { foreignKeyName: "itinerary_items_trip_day_id_fkey"; columns: ["trip_day_id"]; isOneToOne: false; referencedRelation: "trip_days"; referencedColumns: ["id"] }]
      }
      itinerary_templates: {
        Row: { cache_key: string; created_at: string; created_by: string | null; data: Json; days_count: number; destination: string; id: string; is_public: boolean; notes: string | null; pace: string | null; reuse_count: number; style: string | null; updated_at: string }
        Insert: { cache_key: string; created_at?: string; created_by?: string | null; data: Json; days_count: number; destination: string; id?: string; is_public?: boolean; notes?: string | null; pace?: string | null; reuse_count?: number; style?: string | null; updated_at?: string }
        Update: { cache_key?: string; created_at?: string; created_by?: string | null; data?: Json; days_count?: number; destination?: string; id?: string; is_public?: boolean; notes?: string | null; pace?: string | null; reuse_count?: number; style?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "itinerary_templates_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      lodgings: {
        Row: { address: string | null; amenities: string[] | null; check_in_at: string | null; check_out_at: string | null; cost_amount: number | null; cost_currency: string | null; created_at: string; created_by: string | null; expense_id: string | null; id: string; kind: string; latitude: number | null; longitude: number | null; name: string; notes: string | null; phone: string | null; rating: number | null; reservation_code: string | null; review: string | null; trip_id: string; updated_at: string; website: string | null; wifi_password: string | null }
        Insert: { address?: string | null; amenities?: string[] | null; check_in_at?: string | null; check_out_at?: string | null; cost_amount?: number | null; cost_currency?: string | null; created_at?: string; created_by?: string | null; expense_id?: string | null; id?: string; kind?: string; latitude?: number | null; longitude?: number | null; name: string; notes?: string | null; phone?: string | null; rating?: number | null; reservation_code?: string | null; review?: string | null; trip_id: string; updated_at?: string; website?: string | null; wifi_password?: string | null }
        Update: { address?: string | null; amenities?: string[] | null; check_in_at?: string | null; check_out_at?: string | null; cost_amount?: number | null; cost_currency?: string | null; created_at?: string; created_by?: string | null; expense_id?: string | null; id?: string; kind?: string; latitude?: number | null; longitude?: number | null; name?: string; notes?: string | null; phone?: string | null; rating?: number | null; reservation_code?: string | null; review?: string | null; trip_id?: string; updated_at?: string; website?: string | null; wifi_password?: string | null }
        Relationships: [{ foreignKeyName: "lodgings_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "lodgings_expense_id_fkey"; columns: ["expense_id"]; isOneToOne: false; referencedRelation: "expenses"; referencedColumns: ["id"] }, { foreignKeyName: "lodgings_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      notification_preferences: {
        Row: { created_at: string; expense_added: boolean; lodging_checkin_offset_minutes: number; lodging_checkin_reminder: boolean; member_joined: boolean; notifications_enabled: boolean; profile_id: string; task_due_offset_minutes: number; task_due_reminder: boolean; trip_edits: boolean; trip_starting_offset_days: number; trip_starting_reminder: boolean; updated_at: string }
        Insert: { created_at?: string; expense_added?: boolean; lodging_checkin_offset_minutes?: number; lodging_checkin_reminder?: boolean; member_joined?: boolean; notifications_enabled?: boolean; profile_id: string; task_due_offset_minutes?: number; task_due_reminder?: boolean; trip_edits?: boolean; trip_starting_offset_days?: number; trip_starting_reminder?: boolean; updated_at?: string }
        Update: { created_at?: string; expense_added?: boolean; lodging_checkin_offset_minutes?: number; lodging_checkin_reminder?: boolean; member_joined?: boolean; notifications_enabled?: boolean; profile_id?: string; task_due_offset_minutes?: number; task_due_reminder?: boolean; trip_edits?: boolean; trip_starting_offset_days?: number; trip_starting_reminder?: boolean; updated_at?: string }
        Relationships: [{ foreignKeyName: "notification_preferences_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      notifications: {
        Row: { body: string | null; created_at: string; data: Json | null; id: string; profile_id: string; read_at: string | null; title: string; type: string }
        Insert: { body?: string | null; created_at?: string; data?: Json | null; id?: string; profile_id: string; read_at?: string | null; title: string; type: string }
        Update: { body?: string | null; created_at?: string; data?: Json | null; id?: string; profile_id?: string; read_at?: string | null; title?: string; type?: string }
        Relationships: [{ foreignKeyName: "notifications_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      places: {
        Row: { address: string | null; category: string | null; created_at: string; created_by: string | null; google_place_id: string | null; id: string; latitude: number | null; longitude: number | null; name: string; neighborhood: string | null; notes: string | null; photo_url: string | null; trip_id: string }
        Insert: { address?: string | null; category?: string | null; created_at?: string; created_by?: string | null; google_place_id?: string | null; id?: string; latitude?: number | null; longitude?: number | null; name: string; neighborhood?: string | null; notes?: string | null; photo_url?: string | null; trip_id: string }
        Update: { address?: string | null; category?: string | null; created_at?: string; created_by?: string | null; google_place_id?: string | null; id?: string; latitude?: number | null; longitude?: number | null; name?: string; neighborhood?: string | null; notes?: string | null; photo_url?: string | null; trip_id?: string }
        Relationships: [{ foreignKeyName: "places_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "places_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      profiles: {
        Row: { avatar_url: string | null; created_at: string; default_currency: string | null; default_monthly_savings: number | null; email: string; full_name: string | null; home_currency: string; id: string; safety_alert_prefs: any | null; updated_at: string }
        Insert: { avatar_url?: string | null; created_at?: string; default_currency?: string | null; default_monthly_savings?: number | null; email: string; full_name?: string | null; home_currency?: string; id: string; safety_alert_prefs?: any | null; updated_at?: string }
        Update: { avatar_url?: string | null; created_at?: string; default_currency?: string | null; default_monthly_savings?: number | null; email?: string; full_name?: string | null; home_currency?: string; id?: string; safety_alert_prefs?: any | null; updated_at?: string }
        Relationships: []
      }
      public_trip_shares: {
        Row: { created_at: string; created_by: string; expires_at: string | null; id: string; include_expenses: boolean; include_lodgings: boolean; include_tasks: boolean; revoked_at: string | null; token: string; trip_id: string; views: number }
        Insert: { created_at?: string; created_by: string; expires_at?: string | null; id?: string; include_expenses?: boolean; include_lodgings?: boolean; include_tasks?: boolean; revoked_at?: string | null; token: string; trip_id: string; views?: number }
        Update: { created_at?: string; created_by?: string; expires_at?: string | null; id?: string; include_expenses?: boolean; include_lodgings?: boolean; include_tasks?: boolean; revoked_at?: string | null; token?: string; trip_id?: string; views?: number }
        Relationships: [{ foreignKeyName: "public_trip_shares_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "public_trip_shares_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      push_tokens: {
        Row: { created_at: string | null; device_name: string | null; id: string; platform: string | null; profile_id: string; token: string; updated_at: string | null }
        Insert: { created_at?: string | null; device_name?: string | null; id?: string; platform?: string | null; profile_id: string; token: string; updated_at?: string | null }
        Update: { created_at?: string | null; device_name?: string | null; id?: string; platform?: string | null; profile_id?: string; token?: string; updated_at?: string | null }
        Relationships: [{ foreignKeyName: "push_tokens_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      reactions: {
        Row: { created_at: string; emoji: string; id: string; itinerary_item_id: string; profile_id: string; trip_id: string }
        Insert: { created_at?: string; emoji: string; id?: string; itinerary_item_id: string; profile_id: string; trip_id: string }
        Update: { created_at?: string; emoji?: string; id?: string; itinerary_item_id?: string; profile_id?: string; trip_id?: string }
        Relationships: [{ foreignKeyName: "reactions_itinerary_item_id_fkey"; columns: ["itinerary_item_id"]; isOneToOne: false; referencedRelation: "itinerary_items"; referencedColumns: ["id"] }, { foreignKeyName: "reactions_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "reactions_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      tasks: {
        Row: { assigned_to: string | null; completed_at: string | null; created_at: string; description: string | null; done: boolean; due_date: string | null; due_time: string | null; id: string; position: number; priority: string | null; reminder_offset_minutes: number | null; title: string; trip_id: string }
        Insert: { assigned_to?: string | null; completed_at?: string | null; created_at?: string; description?: string | null; done?: boolean; due_date?: string | null; due_time?: string | null; id?: string; position?: number; priority?: string | null; reminder_offset_minutes?: number | null; title: string; trip_id: string }
        Update: { assigned_to?: string | null; completed_at?: string | null; created_at?: string; description?: string | null; done?: boolean; due_date?: string | null; due_time?: string | null; id?: string; position?: number; priority?: string | null; reminder_offset_minutes?: number | null; title?: string; trip_id?: string }
        Relationships: [{ foreignKeyName: "tasks_assigned_to_fkey"; columns: ["assigned_to"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "tasks_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      trip_days: {
        Row: { created_at: string; day_date: string; id: string; notes: string | null; position: number; trip_id: string }
        Insert: { created_at?: string; day_date: string; id?: string; notes?: string | null; position?: number; trip_id: string }
        Update: { created_at?: string; day_date?: string; id?: string; notes?: string | null; position?: number; trip_id?: string }
        Relationships: [{ foreignKeyName: "trip_days_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      trip_invites: {
        Row: { created_at: string; created_by: string; expires_at: string | null; id: string; max_uses: number | null; revoked_at: string | null; role: string; token: string; trip_id: string; uses: number }
        Insert: { created_at?: string; created_by: string; expires_at?: string | null; id?: string; max_uses?: number | null; revoked_at?: string | null; role?: string; token: string; trip_id: string; uses?: number }
        Update: { created_at?: string; created_by?: string; expires_at?: string | null; id?: string; max_uses?: number | null; revoked_at?: string | null; role?: string; token?: string; trip_id?: string; uses?: number }
        Relationships: [{ foreignKeyName: "trip_invites_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "trip_invites_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      trip_members: {
        Row: { id: string; joined_at: string; profile_id: string; role: string; trip_id: string }
        Insert: { id?: string; joined_at?: string; profile_id: string; role?: string; trip_id: string }
        Update: { id?: string; joined_at?: string; profile_id?: string; role?: string; trip_id?: string }
        Relationships: [{ foreignKeyName: "trip_members_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "trip_members_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
      trip_plan_checkins: {
        Row: { amount_saved: number; checked_at: string; id: string; note: string | null; plan_id: string; profile_id: string }
        Insert: { amount_saved: number; checked_at?: string; id?: string; note?: string | null; plan_id: string; profile_id: string }
        Update: { amount_saved?: number; checked_at?: string; id?: string; note?: string | null; plan_id?: string; profile_id?: string }
        Relationships: [{ foreignKeyName: "trip_plan_checkins_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "trip_plans"; referencedColumns: ["id"] }, { foreignKeyName: "trip_plan_checkins_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      trip_plans: {
        Row: { budget_monthly: number; budget_saved: number; created_at: string; currency: string; days_count: number; destination: string; estimate_data: Json; id: string; monthly_savings_goal: number | null; notes: string | null; profile_id: string; travel_style: string; travelers_count: number }
        Insert: { budget_monthly?: number; budget_saved?: number; created_at?: string; currency?: string; days_count: number; destination: string; estimate_data: Json; id?: string; monthly_savings_goal?: number | null; notes?: string | null; profile_id: string; travel_style: string; travelers_count?: number }
        Update: { budget_monthly?: number; budget_saved?: number; created_at?: string; currency?: string; days_count?: number; destination?: string; estimate_data?: Json; id?: string; monthly_savings_goal?: number | null; notes?: string | null; profile_id?: string; travel_style?: string; travelers_count?: number }
        Relationships: [{ foreignKeyName: "trip_plans_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      trips: {
        Row: { base_currency: string; cover_image_url: string | null; created_at: string; description: string | null; display_order: number | null; end_date: string | null; feature_expenses: boolean; feature_itinerary: boolean; feature_lodging: boolean; feature_places: boolean; feature_tasks: boolean; feature_transports: boolean; feature_documents: boolean; id: string; owner_id: string; start_date: string | null; title: string; updated_at: string }
        Insert: { base_currency?: string; cover_image_url?: string | null; created_at?: string; description?: string | null; display_order?: number | null; end_date?: string | null; feature_documents?: boolean; feature_expenses?: boolean; feature_itinerary?: boolean; feature_lodging?: boolean; feature_places?: boolean; feature_tasks?: boolean; feature_transports?: boolean; id?: string; owner_id: string; start_date?: string | null; title: string; updated_at?: string }
        Update: { base_currency?: string; cover_image_url?: string | null; created_at?: string; description?: string | null; display_order?: number | null; end_date?: string | null; feature_documents?: boolean; feature_expenses?: boolean; feature_itinerary?: boolean; feature_lodging?: boolean; feature_places?: boolean; feature_tasks?: boolean; feature_transports?: boolean; id?: string; owner_id?: string; start_date?: string | null; title?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "trips_owner_id_fkey"; columns: ["owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      trip_activity: {
        Row: { id: string; trip_id: string; user_id: string; action: string; payload: any; seen_by: string[]; created_at: string }
        Insert: { id?: string; trip_id: string; user_id: string; action: string; payload?: any; seen_by?: string[]; created_at?: string }
        Update: { seen_by?: string[] }
        Relationships: []
      }
      place_reviews: {
        Row: { id: string; place_id: string; place_name: string; trip_id: string | null; user_id: string; rating: number; title: string | null; body: string | null; visited_at: string; helpful_count: number; created_at: string; updated_at: string }
        Insert: { id?: string; place_id: string; place_name: string; trip_id?: string; user_id: string; rating: number; title?: string; body?: string; visited_at: string; helpful_count?: number; created_at?: string; updated_at?: string }
        Update: { rating?: number; title?: string; body?: string; updated_at?: string }
        Relationships: []
      }
      review_helpful_votes: {
        Row: { review_id: string; user_id: string; created_at: string }
        Insert: { review_id: string; user_id: string; created_at?: string }
        Update: never
        Relationships: []
      }
      place_safety_alerts: {
        Row: { id: string; place_id: string; place_name: string; alert_type: string; description: string | null; severity: number; reported_by: string; confirmed_count: number; expires_at: string | null; created_at: string }
        Insert: { id?: string; place_id: string; place_name: string; alert_type: string; description?: string; severity?: number; reported_by: string; confirmed_count?: number; expires_at?: string; created_at?: string }
        Update: { description?: string; severity?: number; expires_at?: string }
        Relationships: []
      }
      safety_alert_confirmations: {
        Row: { alert_id: string; user_id: string; created_at: string }
        Insert: { alert_id: string; user_id: string; created_at?: string }
        Update: never
        Relationships: []
      }
      user_blocks: {
        Row: { id: string; blocker_id: string; blocked_id: string; created_at: string }
        Insert: { id?: string; blocker_id: string; blocked_id: string; created_at?: string }
        Update: { id?: string; blocker_id?: string; blocked_id?: string; created_at?: string }
        Relationships: [
          { foreignKeyName: "user_blocks_blocker_id_fkey"; columns: ["blocker_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "user_blocks_blocked_id_fkey"; columns: ["blocked_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      user_reminders: {
        Row: { body: string | null; created_at: string; id: string; notified_at: string | null; profile_id: string; remind_at: string; title: string; trip_id: string | null }
        Insert: { body?: string | null; created_at?: string; id?: string; notified_at?: string | null; profile_id: string; remind_at: string; title: string; trip_id?: string | null }
        Update: { body?: string | null; created_at?: string; id?: string; notified_at?: string | null; profile_id?: string; remind_at?: string; title?: string; trip_id?: string | null }
        Relationships: [{ foreignKeyName: "user_reminders_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "user_reminders_trip_id_fkey"; columns: ["trip_id"]; isOneToOne: false; referencedRelation: "trips"; referencedColumns: ["id"] }]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      _create_trip_notification: { Args: { p_body?: string; p_data?: Json; p_exclude_profile_id?: string; p_title: string; p_trip_id: string; p_type: string }; Returns: undefined }
      _dispatch_user_reminders: { Args: never; Returns: undefined }
      _reminder_lodging_checkin: { Args: never; Returns: undefined }
      _reminder_task_due: { Args: never; Returns: undefined }
      _reminder_trip_starting: { Args: never; Returns: undefined }
      accept_trip_invite: { Args: { _token: string }; Returns: { reason: string; success: boolean; trip_id: string }[] }
      bump_template_reuse: { Args: { _template_id: string }; Returns: undefined }
      can_edit_trip: { Args: { _trip_id: string }; Returns: boolean }
      delete_my_account: { Args: never; Returns: undefined }
      delete_trip: { Args: { _trip_id: string }; Returns: undefined }
      get_invite_preview: { Args: { _token: string }; Returns: { end_date: string; inviter_name: string; is_valid: boolean; reason: string; role: string; start_date: string; trip_description: string; trip_id: string; trip_title: string }[] }
      is_trip_member: { Args: { _trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { _trip_id: string }; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: { Enums: {} },
} as const
