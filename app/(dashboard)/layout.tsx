"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import SignIn from "@/components/SignIn";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authed, loading } = useApp();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="signin-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="label-strip" style={{ fontSize: 14 }}>
          Loading Workspace...
        </div>
      </div>
    );
  }

  if (!authed) {
    return <SignIn />;
  }

  return (
    <>
      <div className="app-bg" />
      <div className="app-shell">
        <Sidebar />
        <div className="main">
          <Topbar />
          {children}
        </div>
      </div>
    </>
  );
}
