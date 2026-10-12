import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/common";
import { apiPost } from "@/lib/api";
import { errMsg } from "@/lib/hooks";

/** Landing page for Super Admin-issued, single-use reset links. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const m = useMutation({ mutationFn: () => apiPost("/auth/reset-password", { token, password: pw }) });
  const ok = pw.length >= 8 && pw === pw2;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-xl" data-testid="reset-password-page">
        <Logo />
        <h1 className="font-heading text-xl font-semibold">Set a new password</h1>
        {m.isSuccess ? (
          <div className="space-y-3"><p className="text-sm text-emerald-600" data-testid="reset-password-success">Password updated. You can sign in now.</p><Button className="w-full" render={<Link to="/login" />}>Go to sign in</Button></div>
        ) : !token ? <p className="text-sm text-destructive">This link is missing its token.</p> : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(); }}>
            <div className="space-y-1"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password-input" /></div>
            <div className="space-y-1"><Label>Confirm password</Label><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="reset-password-confirm" /></div>
            {pw && pw.length < 8 && <p className="text-xs text-destructive">At least 8 characters</p>}
            {pw2 && pw !== pw2 && <p className="text-xs text-destructive">Passwords don't match</p>}
            {m.isError && <p className="text-xs text-destructive" data-testid="reset-password-error">{errMsg(m.error)}</p>}
            <Button type="submit" className="w-full" disabled={!ok || m.isPending} data-testid="reset-password-submit">{m.isPending ? "Saving…" : "Update password"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
