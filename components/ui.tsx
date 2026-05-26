import React from "react";

// ============ Icons (inline SVG, stroke-based) ============
interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 16, stroke = 1.6, style, className }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style,
    className
  };

  const paths: Record<string, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
    sites: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" />
        <circle cx="6.5" cy="6.5" r="0.5" fill="currentColor" />
        <circle cx="8.5" cy="6.5" r="0.5" fill="currentColor" />
      </>
    ),
    issue: (
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </>
    ),
    wp: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </>
    ),
    diff: (
      <>
        <rect x="3" y="3" width="8" height="18" rx="1.5" />
        <rect x="13" y="3" width="8" height="18" rx="1.5" />
        <path d="M11 12h2" />
      </>
    ),
    reports: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.15.68.4.92.72.24.32.38.7.42 1.09" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    bell: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />
        <path d="M19 14l.7 1.7L21.5 16.4l-1.7.7L19 19l-.7-1.7-1.7-.7 1.7-.7Z" />
        <path d="M5 16l.5 1.2L7 17.7l-1.2.5L5 19.4l-.5-1.2-1.2-.5L4.5 17.2Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
    filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    bolt: <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />,
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </>
    ),
    img: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
    code: (
      <>
        <path d="m16 18 6-6-6-6" />
        <path d="m8 6-6 6 6 6" />
      </>
    ),
    desktop: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    tablet: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </>
    ),
    mobile: (
      <>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M12 18h.01" />
      </>
    ),
    refresh: (
      <>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    play: <path d="M6 4l14 8-14 8z" />,
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </>
    ),
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
    flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1 3-3 0-1.5-1-3-1-4.5C13 8 14 6 14 6s-3 1-5 4c-1.5 2.5-1 4.5-.5 4.5z M12 2c4 4 5 7 5 10a5 5 0 0 1-10 0c0-2 1-4 2-5" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </>
    ),
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
  };

  return <svg {...common}>{paths[name] || null}</svg>;
};

// ============ Brand mark — stylized geometric "watcher" eye ============
interface HorusGlyphProps {
  size?: number;
  color?: string;
  glow?: boolean;
}

export const HorusGlyph: React.FC<HorusGlyphProps> = ({ size = 28, color = "#D9A05B", glow = true }) => {
  const gradId = "hg-iris";
  const glowId = "hg-glow";

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE9B0" />
          <stop offset="60%" stopColor={color} />
          <stop offset="100%" stopColor="#A06900" />
        </radialGradient>
        {glow && (
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? `url(#${glowId})` : undefined}>
        {/* Top eyelid */}
        <path d="M3 16 Q 16 4 29 16" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* Bottom curve + tail */}
        <path d="M3 16 Q 16 24 29 16" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* Eye-of-Horus tail spiral */}
        <path d="M12 19 Q 9 23 6 23 Q 4 23 4 21" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M20 19 L 24 26" stroke={color} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* Iris */}
        <circle cx="16" cy="16" r="4" fill={`url(#${gradId})`} />
        <circle cx="16" cy="16" r="1.4" fill="#070A0F" />
        {/* Scan-line accent */}
        <line x1="9" y1="16" x2="23" y2="16" stroke="#00E5FF" strokeWidth="0.6" opacity="0.55" />
      </g>
    </svg>
  );
};

// ============ Reusable bits ============
interface BadgeProps {
  tone?: "crit" | "high" | "med" | "low" | "ok" | "info" | "gold" | "ghost";
  children: React.ReactNode;
  dot?: boolean;
  lg?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = "low", children, dot, lg, className = "" }) => (
  <span className={`badge ${tone} ${lg ? "lg" : ""} ${className}`}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

interface SeverityChipProps {
  level: string;
}

export const SeverityChip: React.FC<SeverityChipProps> = ({ level }) => {
  const map: Record<string, { tone: BadgeProps["tone"]; text: string }> = {
    critical: { tone: "crit", text: "Critical" },
    high: { tone: "high", text: "High" },
    medium: { tone: "med", text: "Medium" },
    low: { tone: "low", text: "Low" }
  };
  const m = map[level] || map.low;
  return <Badge tone={m.tone} dot>{m.text}</Badge>;
};

interface StatusChipProps {
  status: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status }) => {
  const map: Record<string, { tone: BadgeProps["tone"]; text: string }> = {
    healthy: { tone: "ok", text: "Healthy" },
    attention: { tone: "high", text: "Needs attention" },
    critical: { tone: "crit", text: "Critical" }
  };
  const m = map[status] || map.healthy;
  return <Badge tone={m.tone} dot>{m.text}</Badge>;
};

interface ScoreBarProps {
  value: number;
  max?: number;
}

export const ScoreBar: React.FC<ScoreBarProps> = ({ value, max = 100 }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    value >= 90
      ? "var(--green)"
      : value >= 75
      ? "var(--cyan)"
      : value >= 60
      ? "var(--amber)"
      : "var(--red)";
  return (
    <div className="score-bar">
      <div className="track">
        <div className="fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
      <span style={{ color }}>{value}</span>
    </div>
  );
};

interface SparklineProps {
  points: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}

export const Sparkline: React.FC<SparklineProps> = ({ points, color = "#00E5FF", height = 36, fill = true }) => {
  const w = 200,
    h = height;
  if (!points || points.length === 0) return null;
  const min = Math.min(...points),
    max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, h - ((p - min) / range) * (h - 6) - 3]);
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  const gradId = `g-${color.replace("#", "")}-${points[0]}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
};

interface KPIProps {
  icon: string;
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDir?: "up" | "down" | "flat";
  glow?: string;
  spark?: number[];
  sparkColor?: string;
}

export const KPI: React.FC<KPIProps> = ({
  icon,
  label,
  value,
  unit,
  delta,
  deltaDir = "flat",
  glow = "rgba(0,229,255,0.18)",
  spark,
  sparkColor = "#00E5FF"
}) => (
  <div className="card kpi-card">
    <div className="kpi-bg" style={{ background: glow }} />
    <div className="kpi-head">
      <Icon name={icon} size={13} /> {label}
    </div>
    <div className="kpi-value">
      {value}
      {unit && <span className="unit">{unit}</span>}
    </div>
    <div className="kpi-foot">
      {delta && (
        <span className={`delta ${deltaDir}`}>
          {deltaDir === "up" && "▲ "}
          {deltaDir === "down" && "▼ "}
          {delta}
        </span>
      )}
      <span className="dim">vs last 7d</span>
    </div>
    {spark && (
      <div style={{ marginTop: 4 }}>
        <Sparkline points={spark} color={sparkColor} height={30} />
      </div>
    )}
  </div>
);

interface ToggleProps {
  on: boolean;
  onClick: () => void;
}

export const Toggle: React.FC<ToggleProps> = ({ on, onClick }) => (
  <button className={`toggle ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on} type="button" />
);

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange }) => (
  <div className="tabbar">
    {tabs.map(t => (
      <button key={t} className={`tab ${active === t ? "active" : ""}`} onClick={() => onChange(t)} type="button">
        {t}
      </button>
    ))}
  </div>
);

interface FaviconProps {
  site: { brand: string; initials: string };
  size?: number;
}

export const Favicon: React.FC<FaviconProps> = ({ site, size = 30 }) => (
  <div
    className="fav"
    style={{
      width: size,
      height: size,
      background: `linear-gradient(135deg, ${site.brand}22, ${site.brand}08)`,
      color: site.brand,
      borderColor: `${site.brand}33`
    }}
  >
    {site.initials}
  </div>
);
