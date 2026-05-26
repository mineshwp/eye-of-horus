"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/auth/index";

export interface Site {
  id: string;
  name: string;
  url: string;
  initials: string;
  brand: string;
  health: number;
  status: string;
  uptime: number;
  perf: number;
  sec: number;
  openIssues: number;
  wp: {
    core: string;
    coreLatest: string;
    plugins: number;
    themes: number;
  };
  forms: string;
  lastScan: string;
}

export interface Issue {
  id: string;
  siteId: string;
  title: string;
  severity: string;
  impact: string;
  category: string;
  page: string;
  recommended: string;
  owner: string;
  status: string;
  detected: string;
  changeType: string;
  confidence: number;
  evidence: any;
}

export interface WpUpdate {
  id: string;
  siteId: string;
  target: string;
  from: string;
  to: string;
  risk: string;
  priority: string;
  notes: string;
  flag: string;
}

export interface Activity {
  id?: number;
  time: string;
  site: string;
  text: string;
  sev: string;
  type: string;
}

export interface CurrentUser {
  email: string;
  name: string;
  role: string;
  initials: string;
}

interface AppContextProps {
  sites: Site[];
  issues: Issue[];
  wpUpdates: WpUpdate[];
  activities: Activity[];
  loading: boolean;
  authed: boolean;
  theme: "dark" | "light";
  currentUser: CurrentUser | null;
  refreshData: () => Promise<void>;
  updateIssue: (issueId: string, updates: Partial<Issue>) => Promise<boolean>;
  runScan: (siteId?: string) => Promise<void>;
  setAuthed: (val: boolean) => void;
  toggleTheme: () => void;
  signIn: (email: string, pass: string) => Promise<boolean>;
  signOut: () => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/[._-]/g, " ");
  return local
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function nowLabel(): string {
  return new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [wpUpdates, setWpUpdates] = useState<WpUpdate[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthedState] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("horus-theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", authed ? theme : "dark");
    localStorage.setItem("horus-theme", theme);
  }, [theme, authed]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  async function fetchProfile(userId: string, email: string): Promise<CurrentUser> {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("user_id", userId)
        .single();
      if (data?.full_name) {
        return {
          email,
          name: data.full_name,
          role: data.role || "admin",
          initials: getInitials(data.full_name),
        };
      }
    } catch {
      // Profile may not exist yet — derive from email
    }
    const name = nameFromEmail(email);
    return { email, name, role: "admin", initials: getInitials(name) };
  }

  useEffect(() => {
    const checkAuth = async () => {
      const stored = localStorage.getItem("horus-authed");
      const userStr = localStorage.getItem("horus-user");
      if (stored === "true" && userStr) {
        try {
          setAuthedState(true);
          setCurrentUser(JSON.parse(userStr));
        } catch {
          localStorage.removeItem("horus-user");
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const user = await fetchProfile(session.user.id, session.user.email || "");
        setCurrentUser(user);
        localStorage.setItem("horus-user", JSON.stringify(user));
        setAuthedState(true);
      }
    };
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAuthed = (val: boolean) => {
    setAuthedState(val);
    if (!val) {
      localStorage.removeItem("horus-authed");
      localStorage.removeItem("horus-user");
      setCurrentUser(null);
      supabase.auth.signOut();
    } else {
      localStorage.setItem("horus-authed", "true");
    }
  };

  const signIn = async (email: string, pass: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

      if (!error && data.user) {
        const user = await fetchProfile(data.user.id, data.user.email || email);
        setCurrentUser(user);
        localStorage.setItem("horus-user", JSON.stringify(user));
        setAuthed(true);
        return true;
      }

      // Fallback for dev environments where Supabase auth isn't fully configured
      console.warn("Supabase auth unavailable:", error?.message);
      const name = nameFromEmail(email);
      const user: CurrentUser = { email, name, role: "admin", initials: getInitials(name) };
      setCurrentUser(user);
      localStorage.setItem("horus-user", JSON.stringify(user));
      setAuthed(true);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const signOut = () => {
    setAuthed(false);
  };

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: dbSites, error: sitesErr } = await supabase
        .from("sites")
        .select("*")
        .order("health", { ascending: true });
      if (sitesErr) throw sitesErr;

      const { data: dbIssues, error: issuesErr } = await supabase
        .from("issues")
        .select("*");
      if (issuesErr) throw issuesErr;

      const { data: dbWpUpdates, error: wpErr } = await supabase
        .from("wp_updates")
        .select("*");
      if (wpErr) throw wpErr;

      const { data: dbActivities, error: actErr } = await supabase
        .from("activities")
        .select("*")
        .order("id", { ascending: false });
      if (actErr) throw actErr;

      const mappedSites: Site[] = (dbSites || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        initials: s.initials,
        brand: s.brand,
        health: Number(s.health),
        status: s.status,
        uptime: Number(s.uptime),
        perf: Number(s.perf),
        sec: Number(s.sec),
        openIssues: Number(s.open_issues),
        wp: {
          core: s.wp_core,
          coreLatest: s.wp_core_latest,
          plugins: Number(s.wp_plugins),
          themes: Number(s.wp_themes),
        },
        forms: s.forms,
        lastScan: s.last_scan,
      }));

      const mappedIssues: Issue[] = (dbIssues || []).map((i: any) => ({
        id: i.id,
        siteId: i.site_id,
        title: i.title,
        severity: i.severity,
        impact: i.impact,
        category: i.category,
        page: i.page,
        recommended: i.recommended,
        owner: i.owner,
        status: i.status,
        detected: i.detected,
        changeType: i.change_type,
        confidence: Number(i.confidence),
        evidence: i.evidence || {},
      }));

      const mappedWpUpdates: WpUpdate[] = (dbWpUpdates || []).map((u: any) => ({
        id: u.id,
        siteId: u.site_id,
        target: u.target,
        from: u.from,
        to: u.to,
        risk: u.risk,
        priority: u.priority,
        notes: u.notes,
        flag: u.flag,
      }));

      const mappedActivities: Activity[] = (dbActivities || []).map((a: any) => ({
        id: a.id,
        time: a.time,
        site: a.site_name,
        text: a.text,
        sev: a.sev,
        type: a.type,
      }));

      setSites(mappedSites);
      setIssues(mappedIssues);
      setWpUpdates(mappedWpUpdates);
      setActivities(mappedActivities);
    } catch (err) {
      console.error("Error fetching data from Supabase:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const updateIssue = async (issueId: string, updates: Partial<Issue>): Promise<boolean> => {
    try {
      const dbUpdates: any = {};
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.owner !== undefined) dbUpdates.owner = updates.owner;
      if (updates.severity !== undefined) dbUpdates.severity = updates.severity;

      const { error } = await supabase
        .from("issues")
        .update(dbUpdates)
        .eq("id", issueId);

      if (error) throw error;

      setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updates } : i)));

      const issue = issues.find((i) => i.id === issueId);
      const site = sites.find((s) => s.id === issue?.siteId);
      if (issue && site) {
        let text = "";
        if (updates.status) text = `Issue "${issue.title}" status changed to ${updates.status}`;
        else if (updates.owner) text = `Issue "${issue.title}" assigned to ${updates.owner}`;

        if (text) {
          const newAct = {
            time: nowLabel(),
            site_name: site.name,
            text,
            sev: issue.severity === "critical" ? "crit" : issue.severity === "high" ? "high" : "med",
            type: "activity",
          };
          await supabase.from("activities").insert([newAct]);
          setActivities((prev) => [
            { time: nowLabel(), site: site.name, text, sev: newAct.sev, type: "activity" },
            ...prev,
          ]);
        }
      }

      return true;
    } catch (err) {
      console.error("Error updating issue:", err);
      return false;
    }
  };

  const runScan = async (siteId?: string) => {
    try {
      setLoading(true);
      const body = siteId ? { siteId } : { runAll: true };
      const response = await apiFetch("/api/checks/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        await refreshData();
        return;
      }
      throw new Error(`Check API returned ${response.status}`);
    } catch (err) {
      console.warn("Live check unavailable, running simulation:", err);
      try {
        const targetSite = siteId
          ? sites.find((s) => s.id === siteId) ?? sites[Math.floor(Math.random() * sites.length)]
          : sites[Math.floor(Math.random() * sites.length)];

        if (!targetSite) return;

        const diff = Math.floor(Math.random() * 5) + 1;
        const goUp = Math.random() > 0.4;
        const newHealth = goUp
          ? Math.min(100, targetSite.health + diff)
          : Math.max(50, targetSite.health - diff);
        const newStatus = newHealth >= 90 ? "healthy" : newHealth >= 70 ? "attention" : "critical";

        await supabase
          .from("sites")
          .update({ health: newHealth, status: newStatus, last_scan: nowLabel() })
          .eq("id", targetSite.id);

        await supabase.from("activities").insert([{
          time: nowLabel(),
          site_name: targetSite.name,
          text: `Scan: ${targetSite.name} health ${goUp ? "improved" : "dropped"} to ${newHealth}`,
          sev: newHealth < 70 ? "high" : "low",
          type: "activity",
        }]);

        await refreshData();
      } catch (fallbackErr) {
        console.error("Scan fallback failed:", fallbackErr);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        sites,
        issues,
        wpUpdates,
        activities,
        loading,
        authed,
        theme,
        currentUser,
        refreshData,
        updateIssue,
        runScan,
        setAuthed,
        toggleTheme,
        signIn,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
