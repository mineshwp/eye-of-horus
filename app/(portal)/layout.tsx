import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Eye of Horus — Client Portal",
  description: "Securely view your website performance reports.",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-bg" />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Minimal portal header */}
          <header
            style={{
              padding: "18px 32px",
              borderBottom: "1px solid var(--border-soft)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(7, 10, 15, 0.72)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#FFFFFF",
                border: "1.5px solid rgba(217,160,91,0.55)",
                boxShadow:
                  "0 0 0 3px rgba(217,160,91,0.10), 0 0 12px rgba(217,160,91,0.28)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/horus-mark.png"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: "-0.01em",
                color: "var(--text-primary)",
              }}
            >
              Eye of Horus
              <span
                style={{
                  display: "block",
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: "0.32em",
                  color: "var(--text-dim)",
                  marginTop: 3,
                  textTransform: "uppercase",
                  marginRight: "-0.32em",
                }}
              >
                Client Portal
              </span>
            </div>
          </header>

          {/* Page content */}
          <main style={{ flex: 1 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
