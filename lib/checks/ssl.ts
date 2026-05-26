import { connect } from "tls";
import type { TLSSocket } from "tls";

export interface SslCheckResult {
  valid: boolean;
  daysRemaining: number | null;
  expiryDate: string | null;
  issuer: string | null;
  subject: string | null;
  error: string | null;
}

export function runSslCheck(hostname: string): Promise<SslCheckResult> {
  return new Promise((resolve) => {
    let socket: TLSSocket | null = null;

    const finish = (result: SslCheckResult) => {
      try { socket?.destroy(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ valid: false, daysRemaining: null, expiryDate: null, issuer: null, subject: null, error: "SSL check timed out" });
    }, 10_000);

    try {
      socket = connect(
        {
          host: hostname,
          port: 443,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 8_000,
        },
        () => {
          clearTimeout(timer);
          try {
            const cert = (socket as TLSSocket).getPeerCertificate();

            if (!cert || !cert.valid_to) {
              return finish({ valid: false, daysRemaining: null, expiryDate: null, issuer: null, subject: null, error: "No certificate returned" });
            }

            const expiry = new Date(cert.valid_to);
            const daysRemaining = Math.floor((expiry.getTime() - Date.now()) / 86_400_000);
            const expiryDate = expiry.toISOString().split("T")[0];
            const issuer = (cert.issuer as any)?.O ?? null;
            const subject = (cert.subject as any)?.CN ?? null;

            finish({
              valid: daysRemaining > 0,
              daysRemaining,
              expiryDate,
              issuer,
              subject,
              error: null,
            });
          } catch (e: any) {
            finish({ valid: false, daysRemaining: null, expiryDate: null, issuer: null, subject: null, error: e.message });
          }
        }
      );

      socket.on("error", (err) => {
        clearTimeout(timer);
        finish({ valid: false, daysRemaining: null, expiryDate: null, issuer: null, subject: null, error: err.message });
      });

      socket.on("timeout", () => {
        clearTimeout(timer);
        finish({ valid: false, daysRemaining: null, expiryDate: null, issuer: null, subject: null, error: "Connection timed out" });
      });
    } catch (err: any) {
      clearTimeout(timer);
      finish({ valid: false, daysRemaining: null, expiryDate: null, issuer: null, subject: null, error: err.message });
    }
  });
}
