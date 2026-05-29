"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth/index";
import { Icon } from "@/components/ui";

interface TestPage {
  path: string;
  label?: string;
  visual?: boolean;
}

interface TestForm {
  path: string;
  label?: string;
  selector?: string;
  fields?: Record<string, string>;
  successText?: string;
}

interface TestConfig {
  pages: TestPage[];
  forms: TestForm[];
}

const fieldsToText = (fields?: Record<string, string>) =>
  fields ? Object.entries(fields).map(([k, v]) => `${k}=${v}`).join("\n") : "";

const textToFields = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text.split("\n").forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
  });
  return out;
};

export default function WatchtowerConfig({
  siteId,
  siteName,
  onClose,
}: {
  siteId: string;
  siteName: string;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<TestPage[]>([]);
  const [forms, setForms] = useState<TestForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch(`/api/sites/${siteId}/test-config`)
      .then((r) => r.json())
      .then((data: { config?: TestConfig }) => {
        if (!active) return;
        setPages(data.config?.pages ?? []);
        setForms(data.config?.forms ?? []);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [siteId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/test-config`, {
        method: "PUT",
        body: JSON.stringify({ config: { pages, forms } }),
      });
      if (res.ok) {
        setToast("Watchtower configuration saved.");
        setTimeout(() => onClose(), 700);
      } else {
        const d = await res.json().catch(() => ({}));
        setToast(`Save failed: ${d.error ?? "unknown error"}`);
      }
    } catch {
      setToast("Save failed: could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const addPage = () => setPages((p) => [...p, { path: "/", label: "", visual: true }]);
  const updatePage = (i: number, patch: Partial<TestPage>) =>
    setPages((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removePage = (i: number) => setPages((p) => p.filter((_, idx) => idx !== i));

  const addForm = () => setForms((f) => [...f, { path: "/contact", label: "", selector: "", fields: {}, successText: "" }]);
  const updateForm = (i: number, patch: Partial<TestForm>) =>
    setForms((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeForm = (i: number) => setForms((f) => f.filter((_, idx) => idx !== i));

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998,
        display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "5vh 16px", overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-head" style={{ position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <h3><Icon name="settings" size={14} /> Watchtower config · {siteName}</h3>
          <button className="btn ghost sm" onClick={onClose} type="button"><Icon name="x" size={13} /></button>
        </div>

        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {loading ? (
            <div className="muted" style={{ fontSize: 13 }}>Loading configuration…</div>
          ) : (
            <>
              {/* Pages */}
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Pages to scan</div>
                    <div className="muted" style={{ fontSize: 12 }}>Paths (relative to the site URL) captured for visual regression on every viewport.</div>
                  </div>
                  <button className="btn sm" onClick={addPage} type="button"><Icon name="plus" size={12} /> Add page</button>
                </div>
                {pages.length === 0 && (
                  <div className="muted" style={{ fontSize: 12, padding: "8px 0" }}>No pages configured. The homepage (/) is scanned by default.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pages.map((pg, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input className="input" style={{ flex: "0 0 200px", fontSize: 13 }} placeholder="/about" value={pg.path}
                        onChange={(e) => updatePage(i, { path: e.target.value })} />
                      <input className="input" style={{ flex: 1, fontSize: 13 }} placeholder="Label (optional)" value={pg.label ?? ""}
                        onChange={(e) => updatePage(i, { label: e.target.value })} />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={pg.visual !== false} onChange={(e) => updatePage(i, { visual: e.target.checked })} /> visual
                      </label>
                      <button className="btn ghost sm" onClick={() => removePage(i)} type="button"><Icon name="x" size={12} /></button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Forms */}
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Forms to test</div>
                    <div className="muted" style={{ fontSize: 12 }}>Horus navigates to the page, fills the mapped fields, submits, and checks for the success text.</div>
                  </div>
                  <button className="btn sm" onClick={addForm} type="button"><Icon name="plus" size={12} /> Add form</button>
                </div>
                {forms.length === 0 && (
                  <div className="muted" style={{ fontSize: 12, padding: "8px 0" }}>No forms configured.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {forms.map((fm, i) => (
                    <div key={i} style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input className="input" style={{ flex: "0 0 200px", fontSize: 13 }} placeholder="/contact" value={fm.path}
                          onChange={(e) => updateForm(i, { path: e.target.value })} />
                        <input className="input" style={{ flex: 1, fontSize: 13 }} placeholder="Label (optional)" value={fm.label ?? ""}
                          onChange={(e) => updateForm(i, { label: e.target.value })} />
                        <button className="btn ghost sm" onClick={() => removeForm(i)} type="button"><Icon name="x" size={12} /></button>
                      </div>
                      <input className="input" style={{ fontSize: 13 }} placeholder="Form CSS selector (optional, e.g. #contact-form or form.wpforms-form)" value={fm.selector ?? ""}
                        onChange={(e) => updateForm(i, { selector: e.target.value })} />
                      <div>
                        <div className="label-strip" style={{ marginBottom: 4 }}>Field values (one per line: field=value)</div>
                        <textarea className="input" style={{ fontSize: 12, fontFamily: "var(--font-mono)", minHeight: 70, width: "100%" }}
                          placeholder={"email=qa@test.invalid\nname=QA Test\nmessage=Automated QA test"}
                          value={fieldsToText(fm.fields)}
                          onChange={(e) => updateForm(i, { fields: textToFields(e.target.value) })} />
                      </div>
                      <input className="input" style={{ fontSize: 13 }} placeholder='Success text (e.g. "Thank you")' value={fm.successText ?? ""}
                        onChange={(e) => updateForm(i, { successText: e.target.value })} />
                    </div>
                  ))}
                </div>
              </section>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
                <button className="btn" onClick={onClose} type="button">Cancel</button>
                <button className="btn primary" onClick={save} disabled={saving} type="button">
                  {saving ? "Saving…" : "Save configuration"}
                </button>
              </div>
            </>
          )}
        </div>

        {toast && (
          <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "var(--bg-card)", border: "1px solid var(--border-soft)", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999 }}>{toast}</div>
        )}
      </div>
    </div>
  );
}
