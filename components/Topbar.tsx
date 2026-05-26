"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Icon } from "./ui";

export default function Topbar() {
  const pathname = usePathname();
  const { sites, issues, theme, toggleTheme, runScan, signOut } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close notifications popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

      <div className="search">
        <Icon name="search" size={14} />
        <input placeholder="Search sites, issues, plugins…" />
        <span className="kbd">⌘K</span>
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
