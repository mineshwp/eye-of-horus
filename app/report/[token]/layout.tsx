import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Eye of Horus — Website Report',
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #ffffff;
            color: #111827;
            font-size: 14px;
            line-height: 1.6;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @media print {
            .no-print { display: none !important; }
            .print-break { page-break-before: always; }
            body { font-size: 12pt; }
            .report-section { page-break-inside: avoid; }
          }
          .report-container { max-width: 860px; margin: 0 auto; padding: 40px 32px; }
          .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #e5e7eb; }
          .report-logo { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 4px; }
          .report-title { font-size: 26px; font-weight: 700; color: #111827; }
          .report-meta { text-align: right; font-size: 13px; color: #6b7280; }
          .report-section { margin-bottom: 40px; }
          .section-title { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #9ca3af; margin-bottom: 16px; font-weight: 500; }
          .metric-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
          .metric-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
          .metric-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
          .metric-value { font-size: 24px; font-weight: 700; color: #111827; }
          .metric-delta { font-size: 12px; margin-top: 4px; }
          .delta-up { color: #22C55E; }
          .delta-down { color: #EF4444; }
          .issue-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
          .severity-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
          .sev-critical { background: #fef2f2; color: #b91c1c; }
          .sev-high { background: #fff7ed; color: #c2410c; }
          .sev-medium { background: #fefce8; color: #a16207; }
          .sev-low { background: #f0fdf4; color: #15803d; }
          .rec-list { list-style: none; }
          .rec-list li { padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13.5px; color: #374151; display: flex; align-items: flex-start; gap: 10px; }
          .rec-list li::before { content: '→'; color: #d97706; font-weight: 600; flex-shrink: 0; margin-top: 1px; }
          .report-footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
          .print-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: #111827; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; }
          .print-btn:hover { background: #1f2937; }
          .health-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 8px; }
          .health-fill { height: 100%; border-radius: 4px; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
