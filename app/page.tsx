"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import SignIn from "@/components/SignIn";

export default function Home() {
  const { authed, loading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && authed) {
      router.replace("/dashboard");
    }
  }, [authed, loading, router]);

  if (loading) {
    return (
      <div className="signin-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="label-strip" style={{ fontSize: 14 }}>
          Loading Eye of Horus Command Centre...
        </div>
      </div>
    );
  }

  return <SignIn />;
}
