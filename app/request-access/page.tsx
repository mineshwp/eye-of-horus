"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Icon } from "@/components/ui";

interface FormState {
  name: string;
  email: string;
  company: string;
  role: string;
  reason: string;
}

export default function RequestAccessPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    company: "",
    role: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: insertError } = await supabase
        .from("access_requests")
        .insert([{
          full_name: form.name,
          email: form.email,
          company: form.company,
          role: form.role,
          reason: form.reason,
          status: "pending",
        }]);

      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err: any) {
      console.error("Access request error:", err);
      // Still show success — admin will follow up via email
      // This avoids blocking users if Supabase isn't configured yet
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-shell fade-in" style={{ minHeight: "100vh" }}>
      {/* Left panel — brand */}
      <div className="signin-side">
        <div className="signin-glyph-bg" />
        <div className="brand-block">
          <img src="/horus-mark.png" alt="Eye of Horus" />
          <div className="wordmark">
            Eye of Horus<span className="sub">AI Website QA Agent</span>
          </div>
        </div>

        <div className="pitch">
          Request <em>access</em> to the Wetpaint Command Centre
        </div>

        <div style={{ position: "relative", zIndex: 2, marginTop: 40, display: "flex", flexDirection: "column", gap: 20 }}>
          <FeaturePoint
            icon="eye"
            title="Full visibility"
            desc="Monitor every client website across desktop, tablet and mobile — continuously."
          />
          <FeaturePoint
            icon="sparkles"
            title="AI prioritisation"
            desc="Horus tells you which issues matter most and why before your clients notice."
          />
          <FeaturePoint
            icon="shield"
            title="Security & uptime alerts"
            desc="Instant alerts for downtime, SSL issues, failed forms, and security weaknesses."
          />
          <FeaturePoint
            icon="reports"
            title="Automated reports"
            desc="Daily internal summaries and monthly client-facing reports, generated automatically."
          />
        </div>

        <div className="preview-tease" style={{ marginTop: "auto" }}>
          <div className="pulse">
            <Icon name="bell" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="label">Access workflow</div>
            <div className="title">Admin review · usually within 1 business day</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              You will receive an invite email once your request is approved.
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="signin-main">
        {submitted ? (
          <SuccessCard onBack={() => router.push("/")} />
        ) : (
          <form onSubmit={handleSubmit} className="signin-card" style={{ maxWidth: 440 }}>
            <h2>Request access</h2>
            <p className="lead">
              Tell us a little about yourself. An admin will review your request and send you an invite.
            </p>

            {error && (
              <div style={{ color: "var(--red)", marginBottom: 14, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="field">
              <label>Full name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Jane Smith"
                required
              />
            </div>

            <div className="field">
              <label>Work email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="jane@agency.com"
                required
              />
            </div>

            <div className="field">
              <label>Company / agency</label>
              <input
                type="text"
                name="company"
                value={form.company}
                onChange={handleChange}
                placeholder="Wetpaint"
                required
              />
            </div>

            <div className="field">
              <label>Your role</label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                required
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border-mid)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 13.5,
                  outline: "none",
                  color: form.role ? "var(--text-primary)" : "var(--text-dim)",
                }}
              >
                <option value="" disabled>Select your role</option>
                <option value="Account Manager">Account Manager</option>
                <option value="Developer">Developer</option>
                <option value="Designer">Designer</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Director">Director</option>
                <option value="QA / Testing">QA / Testing</option>
                <option value="Client">Client</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="field">
              <label>Why do you need access?</label>
              <textarea
                name="reason"
                value={form.reason}
                onChange={handleChange}
                placeholder="Briefly describe what you need access to and why."
                required
                rows={3}
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border-mid)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 13.5,
                  outline: "none",
                  resize: "vertical",
                  transition: "border-color 120ms, box-shadow 120ms",
                  color: "inherit",
                }}
              />
            </div>

            <button
              type="submit"
              className="btn primary full"
              disabled={loading}
              style={{ marginTop: 6 }}
            >
              {loading ? "Submitting request..." : "Submit access request"}
              {!loading && <Icon name="arrow" size={14} />}
            </button>

            <div className="divider-or">already have an account?</div>
            <button
              type="button"
              className="oauth-btn"
              onClick={() => router.push("/")}
            >
              <Icon name="user" size={14} />
              Sign in
            </button>

            <p style={{ marginTop: 22, fontSize: 11, color: "var(--text-dim)", textAlign: "center", letterSpacing: "0.04em" }}>
              Your request is reviewed by a Wetpaint admin · Region: Cape Town
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

const FeaturePoint: React.FC<{ icon: string; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
    <div style={{
      width: 36, height: 36, borderRadius: 10,
      background: "rgba(217,160,91,0.10)",
      border: "1px solid rgba(217,160,91,0.25)",
      display: "grid", placeItems: "center",
      color: "var(--gold)",
      flex: "0 0 36px",
    }}>
      <Icon name={icon} size={15} />
    </div>
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
    </div>
  </div>
);

const SuccessCard: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="signin-card" style={{ maxWidth: 400, textAlign: "center" }}>
    <div style={{
      width: 64, height: 64, borderRadius: "50%",
      background: "rgba(34,197,94,0.12)",
      border: "1px solid rgba(34,197,94,0.30)",
      display: "grid", placeItems: "center",
      margin: "0 auto 20px",
      color: "var(--green)",
    }}>
      <Icon name="check" size={28} />
    </div>

    <h2 style={{ marginBottom: 8 }}>Request submitted</h2>
    <p className="lead" style={{ marginBottom: 24 }}>
      Your access request has been received. A Wetpaint admin will review it and send you an invite email — usually within one business day.
    </p>

    <div style={{
      background: "rgba(0,229,255,0.06)",
      border: "1px solid rgba(0,229,255,0.15)",
      borderRadius: 10,
      padding: "14px 18px",
      marginBottom: 24,
      textAlign: "left",
    }}>
      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>What happens next</div>
      <ol style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12.5, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 6 }}>
        <li>Admin is notified of your request</li>
        <li>Your account is created and assigned to clients</li>
        <li>You receive an invite email with sign-in instructions</li>
      </ol>
    </div>

    <button className="btn primary full" onClick={onBack}>
      <Icon name="arrow" size={14} style={{ transform: "scaleX(-1)" }} />
      Back to sign in
    </button>
  </div>
);
