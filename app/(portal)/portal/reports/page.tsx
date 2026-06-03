"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// Create a fresh Supabase client (no shared agency AppContext)
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

interface Profile {
  full_name: string;
  email: string;
  role: string;
  status: string;
}

interface Report {
  id: string;
  client_id: string;
  site_id: string;
  title: string | null;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  share_token: string;
  created_at: string;
}

interface Site {
  id: string;
  name: string;
  url: string;
}

interface ClientUser {
  client_id: string;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString("en-ZA", { day: "numeric", month: "long" })} – ${e.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ClientReportsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getSupabase();

      // 1. Check auth
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/portal/login");
        return;
      }

      const userId = session.user.id;

      // 2. Fetch profile, verify client role
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("full_name, email, role, status")
        .eq("user_id", userId)
        .single();

      if (profileErr || !profileData) {
        if (!cancelled) setError("Unable to load your profile. Please sign in again.");
        setLoading(false);
        return;
      }

      if (profileData.role !== "client") {
        // Agency user stumbled here — redirect to main dashboard
        router.replace("/");
        return;
      }

      if (!cancelled) setProfile(profileData as Profile);

      // 3. Fetch client assignments
      const { data: assignments, error: assignErr } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", userId);

      if (assignErr || !assignments || assignments.length === 0) {
        if (!cancelled) {
          setLoading(false);
          // No assignments — still show page but with empty state
        }
        return;
      }

      const clientIds = (assignments as ClientUser[]).map((a) => a.client_id);

      // 4. Fetch reports for all assigned clients (monthly, approved only — RLS also enforces this)
      const { data: reportData, error: reportErr } = await supabase
        .from("reports")
        .select("id, client_id, site_id, title, report_type, period_start, period_end, status, share_token, created_at")
        .in("client_id", clientIds)
        .eq("report_type", "monthly")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(12);

      if (reportErr) {
        if (!cancelled) setError("Unable to load reports. Please try again.");
        setLoading(false);
        return;
      }

      // 5. Fetch the sites referenced by those reports so we can show name/URL.
      //    sites has no client_id column; the RLS policy scopes client reads by
      //    report.site_id, so look sites up by the ids in the reports above.
      const siteIds = Array.from(
        new Set(((reportData as Report[]) || []).map((r) => r.site_id).filter(Boolean)),
      );
      let siteData: Site[] = [];
      if (siteIds.length > 0) {
        const { data } = await supabase
          .from("sites")
          .select("id, name, url")
          .in("id", siteIds);
        siteData = (data as Site[]) || [];
      }

      if (!cancelled) {
        setReports((reportData as Report[]) || []);
        setSites(siteData);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSignOut = async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    router.replace("/portal/login");
  };

  // Find a site record for a given report
  const getSite = (report: Report): Site | undefined =>
    sites.find((s) => s.id === report.site_id);

  // ---- Render states ----

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 67px)",
        }}
      >
        <span className="label-strip" style={{ fontSize: 13 }}>
          Loading your reports...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 67px)",
          gap: 16,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div
          style={{
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.28)",
            borderRadius: 10,
            padding: "14px 20px",
            fontSize: 13,
            color: "#FCA5A5",
            maxWidth: 440,
          }}
        >
          {error}
        </div>
        <button className="btn" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="page fade-in" style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Your Reports
          </h1>
          <p className="page-sub">
            {profile ? `Welcome back, ${profile.full_name.split(" ")[0]}. ` : ""}
            Your monthly website performance reports are listed below.
          </p>
        </div>
        <button className="btn sm ghost" onClick={handleSignOut}>
          <svg
            width={13}
            height={13}
            viewBox="0 0 16 16"
            fill="none"
            style={{ opacity: 0.7 }}
          >
            <path
              d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sign out
        </button>
      </div>

      {/* Report list */}
      {reports.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: "60px 20px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "rgba(0,229,255,0.06)",
                border: "1px solid rgba(0,229,255,0.18)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 16px",
                color: "var(--cyan)",
              }}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 12h6M9 16h4M14 3v4a1 1 0 001 1h4M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 6,
              }}
            >
              No reports yet
            </div>
            <p
              className="muted"
              style={{ fontSize: 13, maxWidth: 36 + "ch", margin: "0 auto" }}
            >
              Your monthly website reports will appear here once they have been
              generated. Please check back next month, or contact your account
              manager if you have any questions.
            </p>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {reports.map((report) => {
            const site = getSite(report);
            const period = formatPeriod(report.period_start, report.period_end);
            const generated = formatDate(report.created_at);
            const title =
              report.title ||
              (site ? `${site.name} — Monthly Report` : "Monthly Website Report");

            return (
              <div key={report.id} className="card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    padding: "18px 20px",
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: "rgba(0,229,255,0.07)",
                      border: "1px solid rgba(0,229,255,0.18)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--cyan)",
                      flexShrink: 0,
                    }}
                  >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <path
                        d="M9 12h6M9 16h4M14 3v4a1 1 0 001 1h4M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Report details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--text-primary)",
                        marginBottom: 4,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {title}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "4px 14px",
                        fontSize: 12,
                        color: "var(--text-dim)",
                      }}
                    >
                      {site && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {site.url}
                        </span>
                      )}
                      <span>{period}</span>
                      <span style={{ color: "var(--text-dim)" }}>
                        Generated {generated}
                      </span>
                    </div>
                  </div>

                  {/* Badge + action */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexShrink: 0,
                    }}
                  >
                    <span className="badge ok">
                      <span className="dot" />
                      Approved
                    </span>
                    <a
                      href={`/report/${report.share_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn primary sm"
                    >
                      View Report
                      <svg
                        width={12}
                        height={12}
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M3 8h10M9 4l4 4-4 4"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <p
        className="muted"
        style={{
          fontSize: 11.5,
          textAlign: "center",
          marginTop: 40,
          letterSpacing: "0.03em",
        }}
      >
        Reports are prepared monthly by Wetpaint using Eye of Horus. For
        questions, contact your account manager.
      </p>
    </div>
  );
}
