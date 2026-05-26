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

export interface ReportForms {
  detected: number;
  tested: number;
  passed: number;
}

export interface ReportContent {
  health: ReportHealth;
  issues: ReportIssues;
  wordpress: ReportWordPress;
  playwright: ReportPlaywright;
  forms: ReportForms;
  recommendations: string[];
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
