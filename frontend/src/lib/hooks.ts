import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiGet } from "./api";
import type { Organization, User } from "./types";

export const LOGO =
  "https://customer-assets-m6fa6gv7.emergentagent.net/job_9a74ecc3-1406-41c7-b859-27f365d11bd4/artifacts/eff273b31f7ef718_Talksme.in_Gradient_Chat_Logo-removebg-preview.png";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<User>("/auth/me"),
    // only a real 401 means "signed out"; network blips / 5xx (phone waking up, server restart) are retried, never a logout
    retry: (n, e) => !(e instanceof ApiError && (e.status === 401 || e.status === 403)) && n < 6,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
    staleTime: 60_000,
  });
}

export function useStaffOrg(enabled: boolean) {
  return useQuery({ queryKey: ["org"], queryFn: () => apiGet<Organization>("/org"), enabled });
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const b = e.body as { detail?: unknown } | null;
    if (typeof b?.detail === "string") return b.detail;
    if (Array.isArray(b?.detail)) {
      const first = b.detail[0] as { msg?: string; loc?: string[] };
      return `${first?.loc?.slice(-1)[0] ?? "field"}: ${first?.msg ?? "invalid"}`;
    }
    return `Request failed (${e.status})`;
  }
  return "Network error — check your connection";
}

export const toastErr = (e: unknown) => toast.error(errMsg(e));

export function money(v: number, cur = "INR") {
  return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v || 0);
}
export const compact = (v: number) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v || 0);

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const HOME_BY_ROLE: Record<string, string> = { customer: "/chat", employee: "/employee", admin: "/admin", superadmin: "/superadmin" };
