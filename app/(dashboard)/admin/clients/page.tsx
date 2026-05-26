"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import { Icon, Badge, StatusChip } from "@/components/ui";

interface Client {
  id: string;
  name: string;
  website_url: string;
  industry: string | null;
  status: "active" | "paused" | "archived";
  notes: string | null;
  created_at: string;
}

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  company: string;
  role: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export default function AdminClientsPage() {
  const router = useRouter();
  const { sites } = useApp();

  const [clients, setClients] = useState<Client[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [tab, setTab] = useState<"clients" | "access">("clients");
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [newClient, setNewClient] = useState({
    name: "",
    website_url: "",
    industry: "",
  });
  const [addError, setAddError] = useState("");

  useEffect(() => {
    fetchClients();
    fetchAccessRequests();
  }, []);

  async function fetchClients() {
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      setClients(data || []);
    } catch {
      // Clients table may not exist yet — show sites as fallback
      setClients([]);
    } finally {
      setLoadingClients(false);
    }
  }

  async function fetchAccessRequests() {
    setLoadingRequests(true);
    try {
      const { data, error } = await supabase
        .from("access_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAccessRequests(data || []);
    } catch {
      setAccessRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAddError("Session expired. Please sign out and sign in again.");
        return;
      }
      const { error } = await supabase.from("clients").insert([{
        name: newClient.name,
        website_url: newClient.website_url,
        industry: newClient.industry || null,
        status: "active",
      }]);
      if (error) throw error;
      setNewClient({ name: "", website_url: "", industry: "" });
      setShowAddForm(false);
      fetchClients();
    } catch (err: any) {
      setAddError(err.message || "Failed to add client");
    }
  }

  async function handleApproveRequest(request: AccessRequest) {
    setActionLoading(request.id);
    try {
      await supabase
        .from("access_requests")
        .update({ status: "approved" })
        .eq("id", request.id);
      fetchAccessRequests();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectRequest(request: AccessRequest) {
    setActionLoading(request.id);
    try {
      await supabase
        .from("access_requests")
        .update({ status: "rejected" })
        .eq("id", request.id);
      fetchAccessRequests();
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = accessRequests.filter((r) => r.status === "pending").length;

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <Icon name="user" size={22} />
            Client Management
            {pendingCount > 0 && (
              <span style={{ marginLeft: 8 }}>
                <Badge tone="high">
                  {pendingCount} pending request{pendingCount !== 1 ? "s" : ""}
                </Badge>
              </span>
            )}
          </h1>
          <p className="page-sub">
            Manage agency clients and review access requests from the platform.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn primary"
            onClick={() => setShowAddForm(!showAddForm)}
            type="button"
          >
            <Icon name="plus" size={13} /> Add client
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border-soft)", paddingBottom: 0 }}>
        <TabBtn active={tab === "clients"} onClick={() => setTab("clients")} count={clients.length}>
          Clients
        </TabBtn>
        <TabBtn active={tab === "access"} onClick={() => setTab("access")} count={pendingCount} alert={pendingCount > 0}>
          Access Requests
        </TabBtn>
      </div>

      {/* Add client form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: 20, padding: "20px 24px" }}>
          <h3 style={{ marginBottom: 16, fontSize: 14 }}>
            <Icon name="plus" size={14} /> New client
          </h3>
          <form onSubmit={handleAddClient} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 180px", marginBottom: 0 }}>
              <label>Client name</label>
              <input
                type="text"
                value={newClient.name}
                onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))}
                placeholder="Acme Finance"
                required
              />
            </div>
            <div className="field" style={{ flex: "2 1 260px", marginBottom: 0 }}>
              <label>Website URL</label>
              <input
                type="url"
                value={newClient.website_url}
                onChange={(e) => setNewClient((p) => ({ ...p, website_url: e.target.value }))}
                placeholder="https://acmefinance.co.za"
                required
              />
            </div>
            <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
              <label>Industry (optional)</label>
              <input
                type="text"
                value={newClient.industry}
                onChange={(e) => setNewClient((p) => ({ ...p, industry: e.target.value }))}
                placeholder="Financial Services"
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn primary">Save</button>
              <button type="button" className="btn ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </form>
          {addError && (
            <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{addError}</div>
          )}
        </div>
      )}

      {/* Clients tab */}
      {tab === "clients" && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="sites" size={14} /> Managed clients</h3>
            <span className="h-sub">{clients.length} total</span>
          </div>

          {loadingClients ? (
            <div className="empty" style={{ padding: "32px 0" }}>Loading clients...</div>
          ) : clients.length === 0 ? (
            <div className="empty" style={{ padding: "32px 0" }}>
              No clients added yet. Click "Add client" to get started.
              <br />
              <span className="dim" style={{ fontSize: 12, marginTop: 6, display: "block" }}>
                Note: Run the Phase 1 extended migration in Supabase first if the clients table doesn&apos;t exist.
              </span>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Industry</th>
                  <th>Status</th>
                  <th>Monitoring</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const monitoredSite = sites.find(
                    (s) => s.url === client.website_url.replace(/^https?:\/\//, "")
                  );
                  return (
                    <tr key={client.id} className="trow">
                      <td>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13.5 }}>{client.name}</div>
                          <div className="dim" style={{ fontSize: 12 }}>{client.website_url}</div>
                        </div>
                      </td>
                      <td className="dim" style={{ fontSize: 12.5 }}>
                        {client.industry || "—"}
                      </td>
                      <td>
                        <Badge tone={client.status === "active" ? "ok" : client.status === "paused" ? "med" : "ghost"}>
                          {client.status}
                        </Badge>
                      </td>
                      <td>
                        {monitoredSite ? (
                          <StatusChip status={monitoredSite.status} />
                        ) : (
                          <Badge tone="ghost">Not monitored</Badge>
                        )}
                      </td>
                      <td className="dim mono" style={{ fontSize: 12 }}>
                        {new Date(client.created_at).toLocaleDateString("en-ZA")}
                      </td>
                      <td>
                        {monitoredSite && (
                          <button
                            className="btn ghost sm"
                            onClick={() => router.push(`/sites/${monitoredSite.id}`)}
                            type="button"
                          >
                            View <Icon name="chevron" size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Access requests tab */}
      {tab === "access" && (
        <div className="card">
          <div className="card-head">
            <h3><Icon name="bell" size={14} /> Access requests</h3>
            <span className="h-sub">{pendingCount} pending</span>
          </div>

          {loadingRequests ? (
            <div className="empty" style={{ padding: "32px 0" }}>Loading requests...</div>
          ) : accessRequests.length === 0 ? (
            <div className="empty" style={{ padding: "32px 0" }}>
              No access requests yet.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Reason</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accessRequests.map((req) => (
                  <tr key={req.id} className="trow">
                    <td>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{req.full_name}</div>
                        <div className="dim" style={{ fontSize: 12 }}>{req.email}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{req.company}</td>
                    <td style={{ fontSize: 13 }}>{req.role}</td>
                    <td style={{ fontSize: 12, color: "var(--text-tertiary)", maxWidth: 240 }}>
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {req.reason}
                      </span>
                    </td>
                    <td className="dim mono" style={{ fontSize: 12 }}>
                      {new Date(req.created_at).toLocaleDateString("en-ZA")}
                    </td>
                    <td>
                      <Badge
                        tone={req.status === "pending" ? "med" : req.status === "approved" ? "ok" : "crit"}
                      >
                        {req.status}
                      </Badge>
                    </td>
                    <td>
                      {req.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn primary sm"
                            disabled={actionLoading === req.id}
                            onClick={() => handleApproveRequest(req)}
                            type="button"
                          >
                            <Icon name="check" size={11} /> Approve
                          </button>
                          <button
                            className="btn danger sm"
                            disabled={actionLoading === req.id}
                            onClick={() => handleRejectRequest(req)}
                            type="button"
                          >
                            <Icon name="x" size={11} /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const TabBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  count?: number;
  alert?: boolean;
  children: React.ReactNode;
}> = ({ active, onClick, count, alert, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: "none",
      border: "none",
      padding: "10px 16px",
      fontSize: 13.5,
      fontWeight: active ? 600 : 400,
      color: active ? "var(--text-primary)" : "var(--text-dim)",
      borderBottom: active ? "2px solid var(--cyan)" : "2px solid transparent",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: -1,
    }}
  >
    {children}
    {count != null && count > 0 && (
      <span style={{
        fontSize: 11,
        padding: "1px 6px",
        borderRadius: 10,
        background: alert ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.08)",
        color: alert ? "var(--red)" : "var(--text-tertiary)",
        border: `1px solid ${alert ? "rgba(239,68,68,0.30)" : "var(--border-soft)"}`,
      }}>
        {count}
      </span>
    )}
  </button>
);
