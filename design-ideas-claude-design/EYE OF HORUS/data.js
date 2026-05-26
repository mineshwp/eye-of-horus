// Mock data for Eye of Horus prototype
window.HORUS_DATA = (() => {
  const sites = [
    { id: "acme", name: "Acme Finance", url: "acmefinance.co.za", initials: "AF", brand: "#3B82F6", health: 64, status: "critical", uptime: 99.96, perf: 72, sec: 86, openIssues: 4, wp: { core: "6.5.2", coreLatest: "6.6.1", plugins: 6, themes: 1 }, forms: "issue", lastScan: "12 min ago" },
    { id: "greenfield", name: "Greenfield Estates", url: "greenfieldestates.com", initials: "GE", brand: "#22C55E", health: 88, status: "attention", uptime: 99.99, perf: 84, sec: 92, openIssues: 2, wp: { core: "6.6.1", coreLatest: "6.6.1", plugins: 3, themes: 0 }, forms: "ok", lastScan: "8 min ago" },
    { id: "nova", name: "Nova Legal", url: "novalegal.law", initials: "NL", brand: "#8B5CF6", health: 94, status: "healthy", uptime: 100.0, perf: 91, sec: 96, openIssues: 0, wp: { core: "6.6.1", coreLatest: "6.6.1", plugins: 1, themes: 0 }, forms: "ok", lastScan: "5 min ago" },
    { id: "flexcom", name: "Flexcom Recruitment", url: "flexcom.jobs", initials: "FX", brand: "#F59E0B", health: 79, status: "attention", uptime: 99.92, perf: 76, sec: 88, openIssues: 3, wp: { core: "6.5.5", coreLatest: "6.6.1", plugins: 4, themes: 1 }, forms: "ok", lastScan: "21 min ago" },
    { id: "gentech", name: "Gentech Industries", url: "gentech.io", initials: "GT", brand: "#00E5FF", health: 71, status: "attention", uptime: 99.84, perf: 68, sec: 79, openIssues: 5, wp: { core: "6.4.3", coreLatest: "6.6.1", plugins: 8, themes: 2 }, forms: "ok", lastScan: "1 hr ago" },
    { id: "tarsus", name: "Tarsus Cloud Portal", url: "portal.tarsuscloud.com", initials: "TC", brand: "#EF4444", health: 58, status: "critical", uptime: 99.41, perf: 62, sec: 71, openIssues: 7, wp: { core: "6.5.1", coreLatest: "6.6.1", plugins: 11, themes: 1 }, forms: "issue", lastScan: "3 min ago" },
    { id: "wetpaint", name: "Wetpaint Corporate", url: "wetpaint.co.za", initials: "WP", brand: "#D9A05B", health: 96, status: "healthy", uptime: 100.0, perf: 94, sec: 98, openIssues: 0, wp: { core: "6.6.1", coreLatest: "6.6.1", plugins: 0, themes: 0 }, forms: "ok", lastScan: "2 min ago" },
  ];

  const issues = [
    { id: "i1", siteId: "acme", title: "Homepage hero button missing on mobile", severity: "critical", impact: "Lead generation affected", category: "Visual regression", page: "/", recommended: "Restore primary CTA on viewports < 768px. Recent theme update overrode mobile visibility.", owner: "M. Patel", status: "Investigating", detected: "Today, 09:14", changeType: "Broken component", confidence: 96, evidence: { left: "12%", top: "62%", width: "32%", height: "10%" } },
    { id: "i2", siteId: "tarsus", title: "Contact form submissions failing", severity: "critical", impact: "Inbound leads not received", category: "Form failure", page: "/contact-us", recommended: "Endpoint /wp-admin/admin-ajax.php returning 500. Disable Form-Pro 4.2.1 update and rollback to 4.1.9.", owner: "J. Ndlovu", status: "In Progress", detected: "Today, 06:42", changeType: "Server error", confidence: 99 },
    { id: "i3", siteId: "gentech", title: "Plugin update pending with compatibility risk", severity: "high", impact: "WooCommerce checkout may break", category: "WordPress update", page: "wp-admin", recommended: "Stage WooCommerce 9.0 update on staging before production. Test cart, checkout, payment hooks.", owner: "Unassigned", status: "New", detected: "Yesterday, 18:22", changeType: "Update risk", confidence: 88 },
    { id: "i4", siteId: "acme", title: "SSL certificate expires in 9 days", severity: "high", impact: "Browser warnings imminent", category: "Security", page: "*.acmefinance.co.za", recommended: "Renew Let's Encrypt cert via host. Verify auto-renew cron is active.", owner: "S. Khumalo", status: "New", detected: "Today, 04:00", changeType: "Cert expiry", confidence: 100 },
    { id: "i5", siteId: "flexcom", title: "Unexpected homepage copy change", severity: "medium", impact: "Tone-of-voice drift", category: "Content", page: "/", recommended: "Hero subheading changed without ticket. Confirm with editor or revert.", owner: "M. Patel", status: "New", detected: "Today, 11:02", changeType: "Copy change", confidence: 92 },
    { id: "i6", siteId: "acme", title: "Layout shift detected on services page", severity: "medium", impact: "CLS regression, SEO risk", category: "Performance", page: "/services", recommended: "New embedded video lacks width/height. Add intrinsic dimensions to reserve space.", owner: "S. Khumalo", status: "Investigating", detected: "Today, 10:48", changeType: "Layout shift", confidence: 91 },
    { id: "i7", siteId: "greenfield", title: "Tracking script removed", severity: "medium", impact: "Conversion data gap", category: "Tracking", page: "global", recommended: "GTM-XJ8FZP missing from <head>. Verify with marketing if intentional.", owner: "Unassigned", status: "New", detected: "Today, 08:31", changeType: "Tag change", confidence: 97 },
    { id: "i8", siteId: "tarsus", title: "JavaScript error spike on checkout page", severity: "high", impact: "Drop-off risk", category: "JS error", page: "/checkout", recommended: "Uncaught TypeError in cart.min.js line 412. 28 errors in last hour vs baseline of 2.", owner: "J. Ndlovu", status: "In Progress", detected: "Today, 07:55", changeType: "Broken component", confidence: 95 },
    { id: "i9", siteId: "flexcom", title: "Missing image on team page", severity: "low", impact: "Visual polish", category: "Visual regression", page: "/about/team", recommended: "Asset /uploads/2024/team-thandi.jpg returns 404. Re-upload or update reference.", owner: "Unassigned", status: "New", detected: "Yesterday, 16:09", changeType: "Missing image", confidence: 100 },
    { id: "i10", siteId: "gentech", title: "Security headers weakened", severity: "high", impact: "XSS exposure increased", category: "Security", page: "global", recommended: "Content-Security-Policy 'unsafe-inline' added in last deploy. Tighten and re-test.", owner: "S. Khumalo", status: "New", detected: "Today, 02:15", changeType: "Header change", confidence: 89 },
  ];

  const wpUpdates = [
    { id: "w1", siteId: "acme", target: "WordPress Core", from: "6.5.2", to: "6.6.1", risk: "low", priority: "high", notes: "Security release. Safe to update.", flag: "Safe update" },
    { id: "w2", siteId: "acme", target: "WooCommerce", from: "8.9.2", to: "9.0.1", risk: "high", priority: "high", notes: "Major version. Custom checkout hooks present.", flag: "Needs staging test" },
    { id: "w3", siteId: "gentech", target: "Elementor Pro", from: "3.21.1", to: "3.22.0", risk: "medium", priority: "medium", notes: "Template overrides detected.", flag: "Needs staging test" },
    { id: "w4", siteId: "gentech", target: "Yoast SEO", from: "22.7", to: "22.9", risk: "low", priority: "low", notes: "Minor patch. Translation strings only.", flag: "Safe update" },
    { id: "w5", siteId: "flexcom", target: "Advanced Custom Fields", from: "6.3.0", to: "6.3.4", risk: "low", priority: "medium", notes: "Field group migration recommended.", flag: "Safe update" },
    { id: "w6", siteId: "tarsus", target: "Form-Pro", from: "4.1.9", to: "4.2.1", risk: "high", priority: "critical", notes: "Currently rolled back due to submission failures.", flag: "Do not update" },
    { id: "w7", siteId: "tarsus", target: "WordPress Core", from: "6.5.1", to: "6.6.1", risk: "medium", priority: "high", notes: "Two minor versions behind. Test admin custom workflows.", flag: "Needs staging test" },
    { id: "w8", siteId: "flexcom", target: "Astra Theme", from: "4.6.10", to: "4.7.2", risk: "low", priority: "low", notes: "No child theme conflicts detected.", flag: "Safe update" },
  ];

  const activity = [
    { time: "09:14", site: "Acme Finance", text: "Visual regression on /  · mobile hero CTA missing", sev: "crit", type: "visual" },
    { time: "08:31", site: "Greenfield Estates", text: "Tracking script GTM-XJ8FZP removed from <head>", sev: "med", type: "tag" },
    { time: "07:55", site: "Tarsus Cloud Portal", text: "JavaScript error rate ↑ 1400% on /checkout", sev: "high", type: "js" },
    { time: "06:42", site: "Tarsus Cloud Portal", text: "Form submissions returning HTTP 500", sev: "crit", type: "form" },
    { time: "04:00", site: "Acme Finance", text: "SSL certificate expires in 9 days", sev: "high", type: "ssl" },
    { time: "02:15", site: "Gentech Industries", text: "Content-Security-Policy weakened in last deploy", sev: "high", type: "sec" },
    { time: "Yesterday", site: "Flexcom Recruitment", text: "Missing image: /uploads/2024/team-thandi.jpg", sev: "low", type: "asset" },
    { time: "Yesterday", site: "Gentech Industries", text: "WooCommerce 9.0 update available · compatibility risk", sev: "high", type: "wp" },
  ];

  return { sites, issues, wpUpdates, activity };
})();
