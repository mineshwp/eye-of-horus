"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useApp, Issue, Site } from "@/context/AppContext";
import {
  Icon,
  Badge,
  SeverityChip,
  StatusChip,
  Favicon,
  HorusGlyph
} from "@/components/ui";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function IssueDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { id: issueId } = use(params);
  const { sites, issues, updateIssue } = useApp();

  const issue = issues.find((i) => i.id === issueId);
  const site = sites.find((s) => s.id === issue?.siteId);

  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [notesList, setNotesList] = useState<{ date: string; author: string; text: string }[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Sync state with issue when loaded
  useEffect(() => {
    if (issue) {
      setStatus(issue.status);
      setOwner(issue.owner);
    }
  }, [issue]);

  // Fetch live AI issue analysis
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!issueId || !site?.id) return;
      setAiLoading(true);
      try {
        const res = await fetch("/api/ai/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueId, siteId: site.id })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.analysis) {
            setAiAnalysis(data.analysis);
          }
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
          <div className="muted">No issue found. Please return to the dashboard.</div>
          <button className="btn primary mt-4" onClick={() => router.push("/dashboard")} type="button">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statuses = ["New", "Investigating", "In Progress", "Resolved", "Ignored"];
  const owners = ["Unassigned", "M. Patel", "J. Ndlovu", "S. Khumalo", "T. Mokoena", "L. Adams"];

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    await updateIssue(issue.id, { status: newStatus });
  };

  const handleOwnerChange = async (newOwner: string) => {
    setOwner(newOwner);
    await updateIssue(issue.id, { owner: newOwner });
  };

  const handlePostNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setNotesList((prev) => [
      ...prev,
      {
        date: "Just now",
        author: "Mia Patel (You)",
        text: note.trim()
      }
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

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, color: "var(--text-tertiary)", fontSize: 12.5 }}>
            <button
              onClick={() => router.push(`/sites/${site.id}`)}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--cyan)",
                cursor: "pointer",
                padding: 0,
                fontSize: 12.5,
                display: "inline-flex",
                alignItems: "center",
                gap: 4
              }}
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
          <button className="btn" onClick={() => alert("Task created successfully in Jira")} type="button">
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <MiniStat label="Client impact" value={issue.impact} />
              <MiniStat label="Why this matters" value="Affects primary conversion path on the highest-traffic page." />
              <MiniStat label="Suggested owner" value="Frontend · M. Patel" />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>
                <Icon name="img" size={14} /> Evidence
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge tone="ghost">
                  <Icon name="mobile" size={11} /> Mobile · iPhone 14
                </Badge>
                <Badge tone="ghost">
                  <Icon name="clock" size={11} /> {issue.detected}
                </Badge>
              </div>
            </div>
            <div className="card-pad">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <EvidenceShot label="Baseline · 7 days ago" showCTA={issue.id !== "i1"} siteUrl={site.url} />
                <EvidenceShot label="Current · today 09:14" showCTA={false} highlight={issue.id === "i1"} siteUrl={site.url} />
              </div>
              
              {issue.id === "i1" && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div className="label-strip" style={{ marginBottom: 6 }}>Detected diff</div>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", display: "block", whiteSpace: "pre-wrap" }}>
{`- <a class="hero-cta primary" href="/get-started">Open an account</a>
+ <a class="hero-cta primary u-hide-mobile" href="/get-started">Open an account</a>`}
                  </code>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                    Class <span className="mono" style={{ color: "var(--gold)" }}>.u-hide-mobile</span> was added by theme update v4.6.10 (yesterday 12:04).
                  </div>
                </div>
              )}

              {issue.id === "i2" && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-inset)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
                  <div className="label-strip" style={{ marginBottom: 6 }}>Detected error log</div>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", display: "block", whiteSpace: "pre-wrap" }}>
{`POST https://acmefinance.co.za/wp-admin/admin-ajax.php 500 (Internal Server Error)
  action: submit_lead_form
  payload: { "name": "Horus Scout", "email": "scout@eyeofhorus.dev" }`}
                  </code>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                    Triggered by Form-Pro update v4.2.1. Forms are unable to serialize submissions due to variable type mismatches.
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
                  <div className="timeline-time">Today · 09:14</div>
                  <div className="timeline-text">Horus detected component discrepancy on page template</div>
                </div>
                <div className="timeline-item warn">
                  <div className="timeline-time">Today · 09:16</div>
                  <div className="timeline-text">Severity level raised to {issue.severity} · matches conversion-path heuristic</div>
                </div>
                {issue.owner !== "Unassigned" && (
                  <div className="timeline-item">
                    <div className="timeline-time">Today · 09:42</div>
                    <div className="timeline-text">Assigned to {issue.owner} · status moved to {issue.status}</div>
                  </div>
                )}
                {notesList.map((n, idx) => (
                  <div className="timeline-item ok" key={idx}>
                    <div className="timeline-time">{n.date}</div>
                    <div className="timeline-text">
                      <strong>{n.author}</strong>: "{n.text}"
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handlePostNote} style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>MP</div>
                <div style={{ flex: 1 }}>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note — visible to your team only."
                    rows={2}
                    style={{
                      width: "100%",
                      padding: 10,
                      fontSize: 13,
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border-mid)",
                      borderRadius: 10,
                      color: "var(--text-primary)",
                      resize: "vertical",
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
                    <button className="btn ghost sm" type="button" onClick={() => alert("Attachment added")}>
                      Attach file
                    </button>
                    <button className="btn primary sm" type="submit">
                      Post note
                    </button>
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
                    <option key={s} value={s}>
                      {s}
                    </option>
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
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </PanelField>
              <PanelField label="Severity">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <SeverityChip level={issue.severity} />
                  <div className={`severity-meter ${issue.severity}`}>
                    {[...Array(5)].map((_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                </div>
              </PanelField>
              <PanelField label="Client impact">
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{issue.impact}</div>
              </PanelField>
              <PanelField label="Tags">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Badge tone="ghost">{issue.category}</Badge>
                  <Badge tone="ghost">mobile</Badge>
                  <Badge tone="ghost">conversion</Badge>
                  <Badge tone="ghost">theme-update</Badge>
                </div>
              </PanelField>

              <div style={{ height: 1, background: "var(--border-soft)" }} />

              <button
                className="btn primary full"
                onClick={() => alert("Escalated to client portal and Slack announcement posted.")}
                type="button"
              >
                Escalate to client-facing
              </button>
              <button className="btn full" onClick={() => alert("Muted alerts for 24 hours.")} type="button">
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
                <dt>Viewports</dt>
                <dd>iPhone 14, Pixel 7, iPad Mini</dd>
                <dt>First seen</dt>
                <dd className="mono">{issue.detected}</dd>
                <dt>Detector</dt>
                <dd>Visual diff · DOM diff</dd>
                <dt>Related</dt>
                <dd>
                  <Badge tone="med">Theme update yesterday</Badge>
                </dd>
              </dl>
            </div>
          </div>

          <div className="ai-callout">
            <span className="ai-tag">
              <Icon name="sparkles" size={11} /> Suggested fix
            </span>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {issue.id === "i1" ? (
                <>
                  Remove <span className="mono" style={{ color: "var(--gold)" }}>.u-hide-mobile</span> from the hero CTA in <span className="mono" style={{ color: "var(--cyan)" }}>header-hero.php</span> (Astra child theme). Or override in custom CSS to display this element on mobile breakpoints.
                </>
              ) : issue.id === "i2" ? (
                <>
                  Disable the update for plugin <span className="mono" style={{ color: "var(--cyan)" }}>Form-Pro</span>. Restore configuration back to <span className="mono" style={{ color: "var(--gold)" }}>4.1.9</span> while developer checks validation filters.
                </>
              ) : (
                <>
                  Review recently modified CSS files or template files. Check if custom styles conflict with layout frameworks or breakpoints.
                </>
              )}
            </div>
            <button
              className="btn primary sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                navigator.clipboard.writeText(
                  issue.id === "i1" 
                    ? `@media (max-width: 767px) { .hero-cta.primary.u-hide-mobile { display: inline-block !important; } }`
                    : `wp plugin install form-pro --version=4.1.9 --force`
                );
                alert("Patch code copied to clipboard!");
              }}
              type="button"
            >
              <Icon name="code" size={12} /> Copy patch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div style={{ padding: 12, background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-soft)", borderRadius: 10 }}>
    <div className="label-strip" style={{ marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4 }}>{value}</div>
  </div>
);

const PanelField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="label-strip" style={{ marginBottom: 6 }}>
      {label}
    </div>
    {children}
  </div>
);

const EvidenceShot = ({ label, showCTA, highlight, siteUrl }: { label: string; showCTA: boolean; highlight?: boolean; siteUrl: string }) => (
  <div>
    <div className="label-strip" style={{ marginBottom: 8 }}>
      {label}
    </div>
    <div className="evidence-shot" style={{ position: "relative" }}>
      <div className="vp-head" style={{ height: 24, background: "rgba(255,255,255,0.04)" }}>
        <div className="vp-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="vp-url">{siteUrl}</div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, height: "calc(100% - 24px)" }}>
        <div className="mock-block h1" style={{ width: "65%" }} />
        <div className="mock-block p" />
        <div className="mock-block p s" />
        <div className="mock-block img" style={{ minHeight: 80 }} />
        {showCTA && <div className="mock-block btn-pri" style={{ background: "var(--gold)" }} />}
        {!showCTA && highlight && (
          <div
            style={{
              border: "2px dashed var(--red)",
              borderRadius: 6,
              padding: 10,
              background: "rgba(239,68,68,0.08)",
              color: "#FCA5A5",
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              textAlign: "center",
            }}
          >
            missing element · "Open an account" CTA
          </div>
        )}
        <div className="mock-block p s" />
      </div>
      {highlight && (
        <div className="hi" style={{ left: "12%", top: "62%", width: "55%", height: "12%" }} />
      )}
    </div>
  </div>
);
