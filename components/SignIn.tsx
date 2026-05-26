"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Icon, HorusGlyph } from "./ui";

export default function SignIn() {
  const { signIn } = useApp();
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
      const success = await signIn(email, password);
      if (!success) {
        setError("Invalid email or password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-shell fade-in">
      <div className="signin-side">
        <div className="signin-glyph-bg" />
        <div className="brand-block">
          <img src="/horus-mark.png" alt="Eye of Horus" />
          <div className="wordmark">
            Eye of Horus<span className="sub">AI Website QA Agent</span>
          </div>
        </div>

        <div className="pitch">
          <span className="cy">Eye of Horus</span> watches what changes, <em>prioritises</em> what matters, and helps your team act <em>before</em> small issues become client problems.
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 32, position: "relative", zIndex: 2 }}>
          <FeatureBullet icon="eye" label="Continuous watch" sub="Every page · every viewport" />
          <FeatureBullet icon="sparkles" label="AI prioritisation" sub="Severity, owner, impact" />
          <FeatureBullet icon="wp" label="WordPress aware" sub="Core, plugin & theme risk" />
        </div>

        <div className="preview-tease">
          <div className="pulse">
            <Icon name="bell" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label">Live · continuous monitoring</div>
            <div className="title">AI-powered website QA — always on</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Uptime · SSL · performance · forms · visual regression · WordPress
            </div>
          </div>
        </div>
      </div>

      <div className="signin-main">
        <form onSubmit={handleSubmit} className="signin-card">
          <h2>Welcome back</h2>
          <p className="lead">Sign in to the Wetpaint workspace.</p>

          {error && (
            <div style={{ color: "var(--red)", marginBottom: 14, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div className="field">
            <label>Work email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 18px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-tertiary)" }}>
              <input type="checkbox" defaultChecked style={{ accentColor: "#00E5FF" }} /> Remember device
            </label>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12.5, color: "var(--cyan)", textDecoration: "none" }}>
              Forgot password?
            </a>
          </div>

          <button type="submit" className="btn primary full" disabled={loading}>
            {loading ? "Verifying..." : "Enter Command Centre"} <Icon name="arrow" size={14} />
          </button>

          <div className="divider-or">don't have access?</div>
          <button
            type="button"
            className="oauth-btn"
            style={{ borderColor: "rgba(217,160,91,0.35)", color: "var(--gold)" }}
            onClick={() => router.push("/request-access")}
          >
            <Icon name="sparkles" size={14} />
            Request access
          </button>

          <p style={{ marginTop: 22, fontSize: 11, color: "var(--text-dim)", textAlign: "center", letterSpacing: "0.04em" }}>
            Protected by SSO · Region: Cape Town
          </p>
        </form>
      </div>
    </div>
  );
}

const FeatureBullet: React.FC<{ icon: string; label: string; sub: string }> = ({ icon, label, sub }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, maxWidth: 200 }}>
    <div style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      background: "rgba(0,229,255,0.08)",
      border: "1px solid rgba(0,229,255,0.20)",
      display: "grid",
      placeItems: "center",
      color: "var(--cyan)",
      flex: "0 0 32px",
    }}>
      <Icon name={icon} size={15} />
    </div>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{sub}</div>
    </div>
  </div>
);
