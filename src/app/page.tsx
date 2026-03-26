"use client";

import { useEffect, useState, useCallback } from "react";
import ChatBox from "@/components/ChatBox";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type Application = {
  id: string;
  company: string;
  role: string;
  location?: string;
  status: string;
  fitScore?: number;
  appliedAt?: string;
  createdAt: string;
  lastActivityAt: string;
  sponsorsH1B?: string;
};

type Stats = {
  total: number;
  saved: number;
  applied: number;
  interviewing: number;
  offers: number;
  rejected: number;
  ghosted: number;
  responseRate: number;
};

type AttentionItem = {
  id: string;
  company: string;
  role: string;
  status?: string;
  daysSinceActivity: number;
};

type DashboardData = {
  applications: Application[];
  stats: Stats;
  attention: {
    stale: AttentionItem[];
    probablyGhosted: AttentionItem[];
    needFollowUp: AttentionItem[];
  };
  topMatches: {
    id: string;
    company: string;
    role: string;
    fitScore: number;
    location?: string;
  }[];
};

const STATUS_COLORS: Record<string, string> = {
  SAVED: "#6b7280",
  APPLIED: "#3b82f6",
  INTERVIEW: "#f59e0b",
  OFFER: "#10b981",
  REJECTED: "#ef4444",
  GHOSTED: "#9ca3af",
  WITHDRAWN: "#8b5cf6",
};

const STATUS_ORDER = ["SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "GHOSTED"];

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
function PipelineColumn({
  title,
  color,
  applications,
  onUpdateStatus,
  updating,
}: {
  title: string;
  color: string;
  applications: Application[];
  onUpdateStatus: (id: string, status: string) => void;
  updating: string | null;
}) {
  return (
    <div
      style={{
        background: "#f9fafb",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontWeight: 600,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: `3px solid ${color}`,
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>{title}</span>
        <span style={{ color }}>{applications.length}</span>
      </div>

      {/* Scrollable cards container - horizontal scroll */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 8,
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {applications.map(app => (
          <ApplicationCard
            key={app.id}
            app={app}
            onUpdateStatus={onUpdateStatus}
            updating={updating}
          />
        ))}
        {applications.length === 0 && (
          <div style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic", padding: 8 }}>
            None yet
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/dashboard")
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id);
    try {
      await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchData();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <p>Loading dashboard...</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <p>Failed to load dashboard data.</p>
      </main>
    );
  }

  const { applications, stats, attention, topMatches } = data;

  const pipeline: Record<string, Application[]> = {};
  STATUS_ORDER.forEach(status => {
    pipeline[status] = applications.filter(a => a.status === status);
  });

  return (
    <main style={{ maxWidth: 1200, margin: "40px auto", padding: 16, fontFamily: "system-ui", paddingBottom: 100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: "48px"}}>Welcome to Your Job Tracker</h1>
        <p style={{ color: "#666", margin: "8px 0 0 0" }}>
          Click the chat button in the bottom-right to add jobs, set your resume, and more.
        </p>
      </div>

      {/* Stats Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Total" value={stats.total} color="#6b7280" />
        <StatCard label="Saved" value={stats.saved} color={STATUS_COLORS.SAVED} />
        <StatCard label="Applied" value={stats.applied} color={STATUS_COLORS.APPLIED} />
        <StatCard label="Interviewing" value={stats.interviewing} color={STATUS_COLORS.INTERVIEW} />
        <StatCard label="Offers" value={stats.offers} color={STATUS_COLORS.OFFER} />
        <StatCard label="Rejected" value={stats.rejected} color={STATUS_COLORS.REJECTED} />
        <StatCard label="Ghosted" value={stats.ghosted} color={STATUS_COLORS.GHOSTED} />
        <StatCard label="Response Rate" value={`${stats.responseRate}%`} color="#8b5cf6" />
      </div>

      {/* Charts Section */}
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 24, marginBottom: 32 }}>
  
  {/* Funnel Bar Chart */}
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
    <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>Application Funnel</h3>
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={[
          { name: "Applied", value: stats.applied + stats.interviewing + stats.offers + stats.rejected + stats.ghosted, fill: STATUS_COLORS.APPLIED },
          { name: "Interview", value: stats.interviewing + stats.offers, fill: STATUS_COLORS.INTERVIEW },
          { name: "Offer", value: stats.offers, fill: STATUS_COLORS.OFFER },
          { name: "Rejected", value: stats.rejected, fill: STATUS_COLORS.REJECTED },
          { name: "Ghosted", value: stats.ghosted, fill: STATUS_COLORS.GHOSTED },
        ]}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <XAxis 
          type="number" 
          allowDecimals={false}
          tickCount={Math.min(stats.total + 1, 6)}
        />
        <YAxis type="category" dataKey="name" />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          <Cell fill={STATUS_COLORS.APPLIED} />
          <Cell fill={STATUS_COLORS.INTERVIEW} />
          <Cell fill={STATUS_COLORS.OFFER} />
          <Cell fill={STATUS_COLORS.REJECTED} />
          <Cell fill={STATUS_COLORS.GHOSTED} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>

  {/* Pie Chart */}
  <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20 }}>
    <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>Outcomes</h3>
    {stats.total > 0 ? (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={[
              { name: "Pending", value: stats.applied, fill: STATUS_COLORS.APPLIED },
              { name: "Interview", value: stats.interviewing, fill: STATUS_COLORS.INTERVIEW },
              { name: "Offer", value: stats.offers, fill: STATUS_COLORS.OFFER },
              { name: "Rejected", value: stats.rejected, fill: STATUS_COLORS.REJECTED },
              { name: "Ghosted", value: stats.ghosted, fill: STATUS_COLORS.GHOSTED },
            ].filter(d => d.value > 0)}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {[
              { fill: STATUS_COLORS.APPLIED },
              { fill: STATUS_COLORS.INTERVIEW },
              { fill: STATUS_COLORS.OFFER },
              { fill: STATUS_COLORS.REJECTED },
              { fill: STATUS_COLORS.GHOSTED },
            ].map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    ) : (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
        No applications yet
      </div>
    )}
  </div>

</div>  

  

      {/* Attention Needed */}
      {(attention.needFollowUp.length > 0 || attention.probablyGhosted.length > 0) && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>⚠️ Needs Attention</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {attention.needFollowUp.length > 0 && (
              <AttentionCard
                title="Follow Up"
                items={attention.needFollowUp}
                color="#f59e0b"
                message="days since applied"
                onUpdateStatus={updateStatus}
                updating={updating}
              />
            )}
            {attention.probablyGhosted.length > 0 && (
              <AttentionCard
                title="Probably Ghosted"
                items={attention.probablyGhosted}
                color="#9ca3af"
                message="days with no response"
                onUpdateStatus={updateStatus}
                updating={updating}
                suggestGhosted
              />
            )}
          </div>
        </div>
      )}

      {/* Top Matches */}
      {topMatches.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Top Matches</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
            {topMatches.map(match => (
              <div
                key={match.id}
                style={{
                  padding: 16,
                  background: "#f0fdf4",
                  borderRadius: 8,
                  border: "1px solid #bbf7d0",
                }}
              >
                <div style={{ fontWeight: 600 }}>{match.company}</div>
                <div style={{ color: "#666", fontSize: 14 }}>{match.role}</div>
                {match.location && <div style={{ color: "#888", fontSize: 13 }}>{match.location}</div>}
                <div style={{ marginTop: 8, color: "#10b981", fontWeight: 600 }}>
                  {match.fitScore}% match
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline View */}
      <div>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Pipeline</h2>
        
        <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
          Track your application progress. Scroll within each section to see more.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Applied - All applications */}
          <PipelineColumn
            title="All Applied"
            color={STATUS_COLORS.APPLIED}
            applications={applications.filter(a => 
              ["APPLIED", "INTERVIEW", "OFFER", "REJECTED", "GHOSTED"].includes(a.status)
            )}
            onUpdateStatus={updateStatus}
            updating={updating}
          />

          {/* Row of outcome statuses */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {/* Pending Response */}
            <PipelineColumn
              title="Pending Response"
              color="#f59e0b"
              applications={applications.filter(a => a.status === "APPLIED")}
              onUpdateStatus={updateStatus}
              updating={updating}
            />

            {/* Interviewing */}
            <PipelineColumn
              title="Interviewing"
              color={STATUS_COLORS.INTERVIEW}
              applications={applications.filter(a => a.status === "INTERVIEW")}
              onUpdateStatus={updateStatus}
              updating={updating}
            />

            {/* Offers */}
            <PipelineColumn
              title="🎉 Offers"
              color={STATUS_COLORS.OFFER}
              applications={applications.filter(a => a.status === "OFFER")}
              onUpdateStatus={updateStatus}
              updating={updating}
            />
          </div>

          {/* Row for negative outcomes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {/* Rejected */}
            <PipelineColumn
              title="Rejected"
              color={STATUS_COLORS.REJECTED}
              applications={applications.filter(a => a.status === "REJECTED")}
              onUpdateStatus={updateStatus}
              updating={updating}
            />

            {/* Ghosted */}
            <PipelineColumn
              title="Ghosted"
              color={STATUS_COLORS.GHOSTED}
              applications={applications.filter(a => a.status === "GHOSTED")}
              onUpdateStatus={updateStatus}
              updating={updating}
            />
          </div>
        </div>
      </div>
      {/* Floating ChatBox */}
      <ChatBox onUpdate={fetchData} />
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ color: "#6b7280", fontSize: 14 }}>{label}</div>
    </div>
  );
}

function ApplicationCard({
  app,
  onUpdateStatus,
  updating,
}: {
  app: Application;
  onUpdateStatus: (id: string, status: string) => void;
  updating: string | null;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const nextStatuses = ["APPLIED", "INTERVIEW", "OFFER", "REJECTED", "GHOSTED"].filter(
    (s) => s !== app.status
  );

  return (
    <div
      style={{
        background: "#fff",
        padding: 10,
        borderRadius: 6,
        border: "1px solid #e5e7eb",
        fontSize: 14,
      }}
    >
      <div style={{ fontWeight: 500 }}>{app.company}</div>
      <div style={{ color: "#666", fontSize: 13 }}>{app.role}</div>

      <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 4 }}>
        {app.appliedAt ? (
          <>Applied {formatDate(app.appliedAt)} ({daysAgo(app.appliedAt)})</>
        ) : (
          <>Added {formatDate(app.createdAt)}</>
        )}
      </div>

      {app.fitScore && (
        <div style={{ color: "#10b981", fontSize: 12, marginTop: 4 }}>
          {app.fitScore}% fit
        </div>
      )}

      {/* Add after fitScore display */}
      {app.sponsorsH1B && (
        <div style={{ 
          fontSize: 11, 
          marginTop: 4,
          padding: "2px 6px",
          borderRadius: 4,
          display: "inline-block",
          background: app.sponsorsH1B === "true" ? "#d1fae5" : app.sponsorsH1B === "false" ? "#fee2e2" : "#f3f4f6",
          color: app.sponsorsH1B === "true" ? "#065f46" : app.sponsorsH1B === "false" ? "#991b1b" : "#6b7280",
        }}>
          {app.sponsorsH1B === "true" ? "✅ H1B" : app.sponsorsH1B === "false" ? "❌ No H1B" : "❓ H1B Unknown"}
        </div>
      )}

      {/* Status selector - inline buttons instead of dropdown */}
      <div style={{ marginTop: 8 }}>
        {!showMenu ? (
          <button
            onClick={() => setShowMenu(true)}
            disabled={updating === app.id}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              borderRadius: 4,
              cursor: "pointer",
              width: "100%",
            }}
          >
            {updating === app.id ? "Updating..." : "Change Status ▾"}
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {nextStatuses.map((status) => (
              <button
                key={status}
                onClick={() => {
                  onUpdateStatus(app.id, status);
                  setShowMenu(false);
                }}
                disabled={updating === app.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px",
                  fontSize: 12,
                  background: "#fff",
                  border: `1px solid ${STATUS_COLORS[status]}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STATUS_COLORS[status],
                  }}
                />
                {status}
              </button>
            ))}
            <button
              onClick={() => setShowMenu(false)}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AttentionCard({
  title,
  items,
  color,
  message,
  onUpdateStatus,
  updating,
  suggestGhosted,
}: {
  title: string;
  items: AttentionItem[];
  color: string;
  message: string;
  onUpdateStatus: (id: string, status: string) => void;
  updating: string | null;
  suggestGhosted?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12, color }}>{title}</div>
      {items.map(item => (
        <div
          key={item.id}
          style={{
            padding: "8px 0",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ fontWeight: 500 }}>{item.company}</div>
              <div style={{ color: "#666", fontSize: 13 }}>{item.role}</div>
            </div>
            <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "right" }}>
              {item.daysSinceActivity}d
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => onUpdateStatus(item.id, "INTERVIEW")}
              disabled={updating === item.id}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Got Interview
            </button>
            <button
              onClick={() => onUpdateStatus(item.id, "REJECTED")}
              disabled={updating === item.id}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Rejected
            </button>
            {suggestGhosted && (
              <button
                onClick={() => onUpdateStatus(item.id, "GHOSTED")}
                disabled={updating === item.id}
                style={{
                  padding: "4px 8px",
                  fontSize: 11,
                  background: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Mark Ghosted
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}