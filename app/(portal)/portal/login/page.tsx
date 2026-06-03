"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

export default function ClientPortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseClient();

      // Sign in with Supabase auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data.user) {
        setError(authError?.message || "Invalid email or password.");
        return;
      }

      // Fetch the user's profile to check their role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("user_id", data.user.id)
        .single();

      if (profileError || !profile) {
        setError("Unable to load your account profile. Please contact support.");
        await supabase.auth.signOut();
        return;
      }

      if (profile.role !== "client") {
        setError("Access denied — this portal is for clients only. Agency staff should sign in at the main dashboard.");
        await supabase.auth.signOut();
        return;
      }

      if (profile.status !== "active") {
        setError("Your account is not yet active. Please contact your account manager.");
        await supabase.auth.signOut();
        return;
      }

      // Authenticated client — redirect to reports
      router.push("/portal/reports");
    } catch (err) {
      console.error("Portal login error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "calc(100vh - 67px)",
        padding: "40px 24px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="signin-card fade-in"
        style={{ maxWidth: 400, width: "100%" }}
      >
        {/* Heading */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 6 }}>Client Portal</h2>
          <p className="lead">Sign in to view your website reports.</p>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.28)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#FCA5A5",
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {/* Email field */}
        <div className="field">
          <label htmlFor="portal-email">Email address</label>
          <input
            id="portal-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            autoFocus
          />
        </div>

        {/* Password field */}
        <div className="field" style={{ marginBottom: 20 }}>
          <label htmlFor="portal-password">Password</label>
          <input
            id="portal-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn primary full"
          disabled={loading}
        >
          {loading ? "Signing in..." : "View My Reports"}
          {!loading && (
            <svg
              width={14}
              height={14}
              viewBox="0 0 16 16"
              fill="none"
              style={{ marginLeft: 2 }}
            >
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* Back link */}
        <p
          style={{
            marginTop: 22,
            fontSize: 12,
            color: "var(--text-dim)",
            textAlign: "center",
          }}
        >
          Agency staff?{" "}
          <Link
            href="/"
            style={{
              color: "var(--cyan)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Sign in to the agency dashboard
          </Link>
        </p>
      </form>
    </div>
  );
}
