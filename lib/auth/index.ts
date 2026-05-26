import { supabase } from "@/lib/supabase";

export type UserRole = "super_admin" | "admin" | "client";

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: "pending" | "active" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  company: string;
  role: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

export async function getClientIdsForUser(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data.map((row: any) => row.client_id);
}

export async function hasRoleAccess(
  requiredRole: UserRole,
  userRole: UserRole
): Promise<boolean> {
  const hierarchy: Record<UserRole, number> = {
    super_admin: 3,
    admin: 2,
    client: 1,
  };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

export async function getPendingAccessRequests(): Promise<AccessRequest[]> {
  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as AccessRequest[];
}

export async function approveAccessRequest(
  requestId: string,
  assignedRole: UserRole
): Promise<boolean> {
  const { error } = await supabase
    .from("access_requests")
    .update({ status: "approved" })
    .eq("id", requestId);

  return !error;
}

export async function rejectAccessRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase
    .from("access_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);

  return !error;
}
