/**
 * Database types.
 *
 * Written by hand to match the reviewed migration files under
 * /supabase/migrations. Do not generate these from a live schema.
 * The schema is owned by those migration files (AGENTS.md rule 2).
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
