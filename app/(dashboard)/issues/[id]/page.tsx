"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/auth/index";
import {
  Icon,
  Badge,
  SeverityChip,
  Favicon,
} from "@/components/ui";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface TeamMember {
  full_name: string;
  role: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function nowLabel(): string {
  return new Date().toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IssueDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id: issueId } = use(params);
  const { sites, issues, updateIssue, currentUser } = useApp();

  const issue = issues.find((i) => i.id === issueId);
  const site = sites.find((s) => s.id === issue?.siteId);

  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [notesList, setNotesList] = useState<{ date: string; author: string; text: string }[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<string[]>(["Unassigned"]);

  useEffect(() => {
    if (issue) {
      setStatus(issue.status);
      setOwner(issue.owner);
    }
  }, [issue]);

  // Load team members from profiles table
  const fetchTeamMembers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("status", "active")
        .order("full_name");
      if (data && data.length > 0) {
        setTeamMembers(["Unassigned", ...data.map((p: TeamMember) => p.full_name)]);
      }
    } catch {
      // Falls back to just Unassigned
    }
  }, []);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!issueId || !site?.id) return;
      setAiLoading(true);
      try {
        const res = await apiFetch("/api/ai/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueId, siteId: site.id }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.analysis) setAiAnalysis(data.analysis);
        }
      } catch (err) {
        console.error("Error loading AI analysis:", err);
      } finally {
        setAiLoading(false);
      }
    };
    fetchAnalysis();
  }, [issueId, site?.id]);

  if (!issue || !site) {
    return (
      <div className="page">
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}>
          <div className="muted">Issue not found. It may have been resolved or removed.</div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => router.push("/dashboard")} type="button">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statuses = ["New", "Investigating", "In Progress", "Resolved", "Ignored"];

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    await updateIssue(issue.id, { status: newStatus });
  };

  const handleOwnerChange = async (newOwner: string) => {
    setOwner(newOwner);
    await updateIssue(issue.id, { owner: newOwner });
  };

  const handlePostNote = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setNotesList((prev) => [
      ...prev,
      {
        date: nowLabel(),
        author: currentUser?.name ?? "You",
        text: note.trim(),
      },
    ]);
    setNote("");
  };

  const handleQuickResolve = async () => {
    setStatus("Resolved");
    await updateIssue(issue.id, { status: "Resolved" });
  };

  const handleQuickIgnore = async () => {
    setStatus("Ignored");
    await updateIssue(issue.id, { status: "Ignored" });
  };

  const userInitials = currentUser ? getInitials(currentUser.name) : "?";

  // Build evidence block from issue data
  const hasEvidence = issue.evidence && Object.keys(issue.evidence).length > 0;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "var(--text-tertiary)", fontSize: 12.5 }}>
            <button
              onClick={() => router.push(`/sites/${site.id}`)}
              style={{ background: "transparent", border: 0, color: "var(--cyan)", cursor: "pointer", padding: 0, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4 }}
              type="button"
            >
              <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} /> {site.name}
            </button>
            <span>·</span>
            <span className="mono">{issue.page}</span>
            <span>·</span>
            <span>{issue.category}</span>
          </div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {issue.title}
            <SeverityChip level={issue.severity} />
          </h1>
          <p className="page-sub">
            Detected by Horus on {issue.detected}. Marked as <strong>{issue.changeType}</strong> with <strong>{issue.confidence}%</strong> confidence.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={handleQuickIgnore} type="button">
            <Icon name="x" size={13} /> Ignore
          </button>
          <button className="btn" onClick={() => alert("Create a task in your project management tool.")} type="button">
            <Icon name="plus" size={13} /> Create task
          </button>
          <button className="btn primary" onClick={handleQuickResolve} type="button">
            <Icon name="check" size={13} /> Mark resolved
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
        {/* Left: AI summary + evidence */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="ai-callout">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span className="ai-tag">
                <Icon name="sparkles" size={11} /> Horus analysis
              </span>
              <span className="dim mono" style={{ fontSize: 11 }}>
                confidence {issue.confidence}%
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, lineHeight: 1.45, fontWeight: 500, marginBottom: 14 }}>
              {aiLoading ? (
                <span className="dim" style={{ fontStyle: "italic" }}>Horus is analyzing this issue…</span>
              ) : aiAnalysis ? (
                aiAnalysis
              ) : (
                issue.recommended
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <MiniStat label="Client impact" value={issue.impact} />
              <MiniStat label="Category" value={issue.category} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="img" size={14} /> Evidence
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge tone="ghost">
                  <Icon name="clock" size={11} /> {issue.detected}
                </Badge>
              </div>
            </div>
            <div className="card-pad">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <EvidenceShot label="Baseline" showCTA siteUrl={site.url} />
                <EvidenceShot label="Current scan" showCTA={false} siteUrl={site.url} />
              </div>

              {hasEvidence && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div className="label-strip" style={{ marginBottom: 6 }}>Detected change region</div>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", display: "block" }}>
                    {JSON.stringify(issue.evidence, null, 2)}
                  </code>
                </div>
              )}

              {!hasEvidence && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div className="label-strip" style={{ marginBottom: 6 }}>Detection method</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {issue.changeType} · {issue.confidence}% confidence
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="activity" size={14} /> Activity history
              </h3>
            </div>
            <div className="card-pad">
              <div className="timeline">
                <div className="timeline-item crit">
                  <div className="timeline-time">{issue.detected}</div>
                  <div className="timeline-text">Horus detected: {issue.changeType} on {issue.page}</div>
                </div>
                <div className="timeline-item warn">
                  <div className="timeline-time">{issue.detected}</div>
                  <div className="timeline-text">Severity set to {issue.severity} · category: {issue.category}</div>
                </div>
                {issue.owner !== "Unassigned" && (
                  <div className="timeline-item">
                    <div className="timeline-time">—</div>
                    <div className="timeline-text">Assigned to {issue.owner} · status: {issue.status}</div>
                  </div>
                )}
                {notesList.map((n, idx) => (
                  <div className="timeline-item ok" key={idx}>
                    <div className="timeline-time">{n.date}</div>
                    <div className="timeline-text">
                      <strong>{n.author}</strong>: &quot;{n.text}&quot;
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handlePostNote} style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
                    fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 11,
                    background: "rgba(0,229,255,0.10)", border: "1px solid rgba(0,229,255,0.25)",
                    color: "var(--cyan)", flexShrink: 0,
                  }}
                >
                  {userInitials}
                </div>
                <div style={{ flex: 1 }}>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note — visible to your team only."
                    rows={2}
                    style={{
                      width: "100%", padding: 10, fontSize: 13,
                      background: "var(--bg-inset)", border: "1px solid var(--border-mid)",
                      borderRadius: 10, color: "var(--text-primary)", resize: "vertical", outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                    <button className="btn primary sm" type="submit">Post note</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Right: workflow panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card">
            <div className="card-head">
              <h3>Workflow</h3>
            </div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <PanelField label="Status">
                <select
                  className="select"
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </PanelField>
              <PanelField label="Owner">
                <select
                  className="select"
                  value={owner}
                  onChange={(e) => handleOwnerChange(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {teamMembers.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </PanelField>
              <PanelField label="Severity">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <SeverityChip level={issue.severity} />
                  <div className={`severity-meter ${issue.severity}`}>
                    {[...Array(5)].map((_, i) => <span key={i} />)}
                  </div>
                </div>
              </PanelField>
              <PanelField label="Client impact">
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{issue.impact}</div>
              </PanelField>
              <PanelField label="Tags">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Badge tone="ghost">{issue.category}</Badge>
                  <Badge tone="ghost">{issue.changeType}</Badge>
                </div>
              </PanelField>

              <div style={{ height: 1, background: "var(--border-soft)" }} />

              <button
                className="btn primary full"
                onClick={() => alert("Escalated. Update your client-facing report to include this issue.")}
                type="button"
              >
                Escalate to client-facing
              </button>
              <button className="btn full" onClick={() => alert("Alerts snoozed for 24 hours.")} type="button">
                Snooze · 24 hours
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Affected scope</h3>
            </div>
            <div className="card-pad">
              <dl className="kv">
                <dt>Site</dt>
                <dd style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Favicon site={site} size={20} /> {site.name}
                </dd>
                <dt>Page</dt>
                <dd className="mono">{issue.page}</dd>
                <dt>First seen</dt>
                <dd className="mono">{issue.detected}</dd>
                <dt>Detector</dt>
                <dd>{issue.changeType}</dd>
                <dt>Confidence</dt>
                <dd>{issue.confidence}%</dd>
              </dl>
            </div>
          </div>

          <div className="ai-callout">
            <span className="ai-tag">
              <Icon name="sparkles" size={11} /> Suggested fix
            </span>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {issue.recommended}
            </div>
            <button
              className="btn primary sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                navigator.clipboard.writeText(issue.recommended);
                alert("Recommendation copied to clipboard.");
              }}
              type="button"
            >
              <Icon name="code" size={12} /> Copy recommendation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div style={{ padding: 12, background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
    <div className="label-strip" style={{ marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4 }}>{value}</div>
  </div>
);

const PanelField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="label-strip" style={{ marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

const EvidenceShot = ({ label, showCTA, siteUrl }: { label: string; showCTA: boolean; siteUrl: string }) => (
  <div>
    <div className="label-strip" style={{ marginBottom: 8 }}>{label}</div>
    <div className="evidence-shot" style={{ position: "relative" }}>
      <div className="vp-head" style={{ height: 24, background: "rgba(255,255,255,0.04)" }}>
        <div className="vp-dots"><span /><span /><span /></div>
        <div className="vp-url">{siteUrl}</div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, height: "calc(100% - 24px)" }}>
        <div className="mock-block h1" style={{ width: "65%" }} />
        <div className="mock-block p" />
        <div className="mock-block p s" />
        <div className="mock-block img" style={{ minHeight: 80 }} />
        {showCTA && <div className="mock-block btn-pri" style={{ background: "var(--gold)" }} />}
        <div className="mock-block p s" />
      </div>
    </div>
  </div>
);
