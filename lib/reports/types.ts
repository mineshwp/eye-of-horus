export interface ReportHealth {
  score: number;
  previousScore: number;
  uptimePercent: number;
  previousUptimePercent: number;
}

export interface ReportIssue {
  title: string;
  severity: string;
  category: string;
  status: string;
  detected_at: string;
}

export interface ReportIssues {
  open: number;
  resolved: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  newThisPeriod: number;
  topIssues: ReportIssue[];
}

export interface ReportWordPress {
  version: string | null;
  phpVersion: string | null;
  pluginsNeedingUpdate: number;
  securityFlags: string[];
  lastSync: string | null;
}

export interface ReportPlaywright {
  totalChecks: number;
  passed: number;
  failed: number;
  regressions: number;
  passRate: number;
}

export interface WPFormStat {
  name: string;
  id: number;
  completedTotal: number;
  abandonedTotal: number;
  completedMonth: number;
  abandonedMonth: number;
  completedLast: number;
  abandonedLast: number;
}

export interface WPFormBreakdown {
  field: string;
  values: { value: string; count: number }[];
}

export interface ReportForms {
  detected: number;
  tested: number;
  passed: number;
  wpforms?: WPFormStat[];
  fieldBreakdowns?: WPFormBreakdown[];
  abandonmentReasons?: { field: string; count: number }[];
  totalCompletedThisMonth?: number;
  totalAbandonedThisMonth?: number;
  totalCompletedLastMonth?: number;
}

export interface ReportSecurityAttackPeriod {
  complex: number;
  brute_force: number;
  blocklist: number;
  total: number;
}

export interface ReportSecurity {
  waf_enabled: boolean;
  waf_rules_premium: boolean;
  ip_blocklist_enabled: boolean;
  brute_force_enabled: boolean;
  attacks_today: ReportSecurityAttackPeriod;
  attacks_week: ReportSecurityAttackPeriod;
  attacks_month: ReportSecurityAttackPeriod;
  scan_issues_count: number;
  malware_found: boolean;
  top_countries: { country: string; count: number }[];
  last_scan_time: string | null;
}

// ─── Phase 1d: executive score, what-changed, ranked recommendations ──────────

export interface ReportPillars {
  performance: number | null;
  ux: number | null;
  seo: number | null;
  accessibility: number | null;
  reliability: number | null;
  /** Average of the available (non-null) pillars, 0–100. */
  overall: number;
}

export interface ReportChange {
  metric: string;
  current: number;
  previous: number;
  /** Signed percentage change, current vs previous. */
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
  /** Whether the movement is good for the business (traffic up = good, errors up = bad). */
  good: boolean;
  unit?: string;
}

export interface ReportRecommendation {
  text: string;
  priority: 'high' | 'medium' | 'low';
  /** Higher = act sooner. Weighted by severity and (for traffic-relevant items) site traffic. */
  impactScore: number;
  category: string;
}

export interface ReportContent {
  health: ReportHealth;
  pillars?: ReportPillars;
  changes?: ReportChange[];
  issues: ReportIssues;
  wordpress: ReportWordPress;
  playwright: ReportPlaywright;
  forms: ReportForms;
  security?: ReportSecurity;
  recommendations: string[];
  rankedRecommendations?: ReportRecommendation[];
  siteName: string;
  siteUrl: string;
  generatedAt: string;
}

export interface Report {
  id: string;
  client_id: string | null;
  site_id: string | null;
  report_type: 'daily' | 'monthly' | 'custom';
  period_start: string;
  period_end: string;
  status: 'generating' | 'ready' | 'error';
  title: string | null;
  executive_summary: string | null;
  content: ReportContent;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}
