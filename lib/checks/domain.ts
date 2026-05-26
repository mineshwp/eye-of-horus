export interface DomainCheckResult {
  domain: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  registrar: string | null;
  error: string | null;
}

/**
 * Strip subdomains and return the registrable domain.
 *
 * This handles common multi-part TLDs (e.g. .co.za, .com.au) by keeping
 * the last two labels unless the second-to-last label is known to be a
 * second-level ccTLD component, in which case we keep three labels.
 *
 * Examples:
 *   www.example.com       → example.com
 *   www.example.co.za     → example.co.za
 *   sub.domain.agency     → domain.agency
 */
function extractRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return hostname;

  // Common second-level ccTLD components that need 3 labels
  const sld = new Set([
    "co", "com", "net", "org", "gov", "edu", "ac", "or", "ne",
    "nic", "mil", "ltd", "plc", "me", "tv",
  ]);

  const tld = parts[parts.length - 1];
  const secondFromRight = parts[parts.length - 2];

  // e.g. example.co.za — keep last three parts
  if (tld.length === 2 && sld.has(secondFromRight)) {
    return parts.slice(-3).join(".");
  }

  // e.g. www.example.com — keep last two parts
  return parts.slice(-2).join(".");
}

/**
 * Parse the registrar name from an RDAP entity vCard array.
 * vCardArray[1] is an array of property arrays: [ [name, params, type, value], ... ]
 */
function parseRegistrar(entities: any[]): string | null {
  if (!Array.isArray(entities)) return null;

  const registrarEntity = entities.find(
    (e: any) => Array.isArray(e.roles) && e.roles.includes("registrar"),
  );
  if (!registrarEntity) return null;

  // Try vcardArray first
  try {
    const vcardArray = registrarEntity.vcardArray;
    if (Array.isArray(vcardArray) && Array.isArray(vcardArray[1])) {
      for (const prop of vcardArray[1]) {
        if (Array.isArray(prop) && prop[0] === "fn") {
          const val = prop[3];
          if (typeof val === "string" && val.trim()) return val.trim();
        }
      }
    }
  } catch {
    // fall through
  }

  // Fallback: publicIds or handle
  if (typeof registrarEntity.handle === "string") return registrarEntity.handle;

  return null;
}

/**
 * Run an RDAP domain expiry check for the given hostname.
 *
 * Strips subdomains before querying so that e.g. www.example.co.za
 * is looked up as example.co.za.
 *
 * Uses https://rdap.org/domain/{domain} — a unified RDAP proxy that
 * requires no API key.
 *
 * Never throws — on any failure returns a result with error set.
 */
export async function runDomainCheck(hostname: string): Promise<DomainCheckResult> {
  const domain = extractRegistrableDomain(hostname);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(`https://rdap.org/domain/${domain}`, {
        signal: controller.signal,
        headers: {
          Accept: "application/rdap+json, application/json",
          "User-Agent": "EyeOfHorus-Monitor/2.0 (+https://wetpaint.co.za)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      return { domain, expiryDate: null, daysRemaining: null, registrar: null, error: "RDAP lookup failed" };
    }

    if (!response.ok) {
      return { domain, expiryDate: null, daysRemaining: null, registrar: null, error: "RDAP lookup failed" };
    }

    const data = await response.json();

    // Parse expiry date from events array
    let expiryDate: string | null = null;
    let daysRemaining: number | null = null;

    if (Array.isArray(data.events)) {
      const expiryEvent = data.events.find(
        (e: any) => e.eventAction === "expiration",
      );
      if (expiryEvent?.eventDate) {
        const expiry = new Date(expiryEvent.eventDate);
        if (!isNaN(expiry.getTime())) {
          expiryDate = expiry.toISOString().split("T")[0];
          daysRemaining = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
        }
      }
    }

    const registrar = parseRegistrar(data.entities ?? []);

    return { domain, expiryDate, daysRemaining, registrar, error: null };
  } catch (err: any) {
    // AbortError means timeout; any other unexpected failure is also caught here
    return { domain, expiryDate: null, daysRemaining: null, registrar: null, error: "RDAP lookup failed" };
  }
}
