"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Icon } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase puts the recovery token in the URL hash; the JS client
  // processes it automatically via onAuthStateChange.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/"), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-shell fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="app-bg" />

      <div className="signin-card" style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <img src="/horus-mark.png" alt="Eye of Horus" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Eye of Horus</span>
        </div>

        <h2 style={{ marginBottom: 6 }}>Set new password</h2>
        <p className="lead" style={{ marginBottom: 20 }}>Choose a strong password for your account.</p>

        {success ? (
          <div style={{ color: "var(--cyan)", padding: "12px 16px", background: "rgba(0,229,255,0.08)", borderRadius: 8, border: "1px solid rgba(0,229,255,0.2)", fontSize: 13.5 }}>
            Password updated. Redirecting you to sign in...
          </div>
        ) : !sessionReady ? (
          <div style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
            Validating reset link... If this takes too long, request a new link from the sign-in page.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>
            )}

            <div className="field">
              <label>New password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  style={{ paddingRight: 40 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center", padding: 0 }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
                </button>
              </div>
            </div>

            <div className="field">
              <label>Confirm password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="Repeat password"
              />
            </div>

            <button type="submit" className="btn primary full" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Saving..." : "Update password"} <Icon name="arrow" size={14} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
