"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Icon } from "./ui";

interface SearchResult {
  kind: "site" | "issue" | "wp";
  id: string;
  label: string;
  sub: string;
  href: string;
}

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sites, issues, wpUpdates, theme, toggleTheme, runScan, signOut } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ── Global search ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const results: SearchResult[] = q
    ? [
        ...sites
          .filter((s) => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q))
          .map((s) => ({ kind: "site" as const, id: s.id, label: s.name, sub: s.url, href: `/sites/${s.id}` })),
        ...issues
          .filter((i) => i.title.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
          .map((i) => ({ kind: "issue" as const, id: i.id, label: i.title, sub: i.category, href: `/issues/${i.id}` })),
        ...wpUpdates
          .filter((u) => u.target.toLowerCase().includes(q))
          .map((u) => ({ kind: "wp" as const, id: u.id, label: u.target, sub: `${u.from ?? ""} → ${u.to ?? ""}`, href: `/wp` })),
      ].slice(0, 8)
    : [];

  const goToResult = (r: SearchResult) => {
    setQuery("");
    setShowResults(false);
    router.push(r.href);
  };

  // Close notifications popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ⌘K / Ctrl+K focuses the search input
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Compute breadcrumbs dynamically
  const getCrumbs = () => {
    const base = "Wetpaint";
    if (pathname === "/dashboard") {
      return [base, "Command Centre"];
    }
    if (pathname.startsWith("/sites/")) {
      const siteId = pathname.split("/").pop() || "";
      const site = sites.find((s) => s.id === siteId);
      return [base, "Websites", site ? site.name : "Site Detail"];
    }
    if (pathname.startsWith("/issues/")) {
      const issueId = pathname.split("/").pop() || "";
      const issue = issues.find((i) => i.id === issueId);
      const site = sites.find((s) => s.id === issue?.siteId);
      return [base, "Websites", site ? site.name : "Site", issue ? `Issue #${issue.id.toUpperCase()}` : "Issue"];
    }
    if (pathname === "/regression") {
      return [base, "Visual changes"];
    }
    if (pathname === "/wp") {
      return [base, "WordPress updates"];
    }
    if (pathname === "/reports") {
      return [base, "Reports & insights"];
    }
    if (pathname === "/settings") {
      return [base, "Monitoring & configuration"];
    }
    return [base, "Workspace"];
  };

  const crumbs = getCrumbs();
  const criticalIssues = issues.filter((i) => i.severity === "critical");

  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span className="sep">
                <Icon name="chevron" size={12} />
              </span>
            )}
            <span className={i === crumbs.length - 1 ? "now" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>

      <div className="topbar-spacer" />

      <div className="search" ref={searchRef} style={{ position: "relative" }}>
        <Icon name="search" size={14} />
        <input
          ref={searchInputRef}
          placeholder="Search sites, issues, plugins…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) goToResult(results[0]);
            if (e.key === "Escape") { setShowResults(false); searchInputRef.current?.blur(); }
          }}
        />
        <span className="kbd">⌘K</span>

        {showResults && q && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              right: 0,
              background: "var(--bg-card)",
              border: "1px solid var(--border-soft)",
              borderRadius: 10,
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              zIndex: 9999,
              overflow: "hidden",
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {results.length === 0 ? (
              <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-tertiary)" }}>
                No matches for “{query}”
              </div>
            ) : (
              results.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  onMouseDown={(e) => { e.preventDefault(); goToResult(r); }}
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "10px 16px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-soft)",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--text-primary)",
                  }}
                >
                  <Icon name={r.kind === "site" ? "sites" : r.kind === "issue" ? "issue" : "wp"} size={14} />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <button className="icon-btn" title="Run scan now" onClick={() => runScan()} type="button">
        <Icon name="refresh" size={15} />
      </button>

      <div style={{ position: "relative" }} ref={popoverRef}>
        <button
          className="icon-btn"
          title="Notifications"
          onClick={() => setShowNotifications(!showNotifications)}
          type="button"
        >
          <Icon name="bell" size={15} />
          {criticalIssues.length > 0 && <span className="dot" />}
        </button>

        {showNotifications && (
          <div
            className="popover"
            style={{
              right: 0,
              top: "calc(100% + 10px)",
              width: 320,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Alert Feed</span>
              <span className="label-strip" style={{ fontSize: 9.5 }}>
                {criticalIssues.length} Critical
              </span>
            </div>
            <div className="divider" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflowY: "auto" }}>
              {criticalIssues.length === 0 ? (
                <div className="empty" style={{ padding: "10px 0", fontSize: 12.5 }}>
                  No critical alerts active.
                </div>
              ) : (
                criticalIssues.map((issue) => (
                  <div
                    key={issue.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: 12.5,
                      alignItems: "flex-start",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ color: "var(--red)", marginTop: 2 }}>
                      <Icon name="issue" size={13} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{issue.title}</div>
                      <div className="dim" style={{ fontSize: 11, marginTop: 1 }}>
                        {sites.find((s) => s.id === issue.siteId)?.name || "Site"} · {issue.page}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <button
        className="icon-btn theme-toggle"
        onClick={toggleTheme}
        title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        aria-label="Toggle colour theme"
        type="button"
      >
        <Icon name={theme === "light" ? "moon" : "sun"} size={15} />
      </button>

      <button className="btn ghost sm" onClick={signOut} title="Lock workspace" type="button">
        <Icon name="user" size={13} /> Lock
      </button>
    </header>
  );
}
