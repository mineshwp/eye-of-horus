"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Icon } from "./ui";

interface NavItemProps {
  icon: string;
  label: string;
  count?: number;
  critical?: boolean;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, count, critical, active, onClick }) => (
  <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} type="button">
    <Icon name={icon} size={16} />
    <span>{label}</span>
    {count != null && <span className={`nav-count ${critical ? "crit" : ""}`}>{count}</span>}
  </button>
);

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { sites, issues, wpUpdates, currentUser, signOut } = useApp();

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const wpCount = wpUpdates.length;

  const navigateTo = (path: string) => {
    router.push(path);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="mark">
          <img src="/horus-mark.png" alt="Horus mark" />
        </div>
        <div className="wordmark">
          Eye of Horus<span className="sub">Command Centre</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Monitor</div>
        <NavItem
          icon="dashboard"
          label="Dashboard"
          active={pathname === "/dashboard"}
          onClick={() => navigateTo("/dashboard")}
        />
        <NavItem
          icon="sites"
          label="Websites"
          count={sites.length}
          active={pathname.startsWith("/sites")}
          onClick={() => {
            // Find first site or default to acme
            const firstSiteId = sites[0]?.id || "acme";
            navigateTo(`/sites/${firstSiteId}`);
          }}
        />
        <NavItem
          icon="issue"
          label="Issues"
          count={criticalCount}
          critical
          active={pathname.startsWith("/issues")}
          onClick={() => {
            // Find first issue or default to i1
            const firstIssueId = issues[0]?.id || "i1";
            navigateTo(`/issues/${firstIssueId}`);
          }}
        />
        <NavItem
          icon="diff"
          label="Visual changes"
          active={pathname === "/regression"}
          onClick={() => navigateTo("/regression")}
        />
        <NavItem
          icon="wp"
          label="WP updates"
          count={wpCount}
          active={pathname === "/wp"}
          onClick={() => navigateTo("/wp")}
        />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspace</div>
        <NavItem
          icon="reports"
          label="Reports"
          active={pathname === "/reports"}
          onClick={() => navigateTo("/reports")}
        />
        <NavItem
          icon="settings"
          label="Monitoring"
          active={pathname === "/settings"}
          onClick={() => navigateTo("/settings")}
        />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Admin</div>
        <NavItem
          icon="user"
          label="Clients"
          active={pathname.startsWith("/admin/clients")}
          onClick={() => navigateTo("/admin/clients")}
        />
      </div>

      <div className="sidebar-foot">
        <div className="user-card" onClick={signOut} style={{ cursor: "pointer" }} title="Click to Sign Out">
          <div className="avatar">{currentUser ? getInitials(currentUser.name) : "MP"}</div>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            <div className="user-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser ? currentUser.name : "Mia Patel"}
            </div>
            <div className="user-role" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentUser ? currentUser.role : "QA Lead · Wetpaint"}
            </div>
          </div>
          <Icon name="x" size={12} style={{ color: "var(--text-dim)", marginLeft: 4 }} />
        </div>
      </div>
    </aside>
  );
}
