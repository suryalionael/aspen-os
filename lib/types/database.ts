// Hand-authored to match supabase/migrations/001-004 exactly, in the shape
// `supabase gen types typescript` produces (including the Relationships /
// Views / Enums / CompositeTypes keys @supabase/supabase-js's generic
// constraints require for .from()/.rpc() type inference to resolve). Once a
// real Supabase project exists, regenerate the authoritative version with:
//   supabase gen types typescript --project-id <id> > lib/types/database.ts
// and diff against this file before trusting it over the hand-authored one.

export type TaskStatus = "backlog" | "todo" | "in_progress" | "done"
export type WorkspaceRole = "owner" | "member"

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: WorkspaceRole
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: WorkspaceRole
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string
          role?: WorkspaceRole
          created_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          workspace_id: string
          name: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          project_id: string
          title: string
          status: TaskStatus
          position: number
          assignee_id: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          title: string
          status?: TaskStatus
          position: number
          assignee_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          title?: string
          status?: TaskStatus
          position?: number
          assignee_id?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_workspace_with_owner: {
        Args: {
          workspace_name: string
          workspace_slug: string
        }
        Returns: Database["public"]["Tables"]["workspaces"]["Row"]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
