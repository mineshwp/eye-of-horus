export interface HttpCheckResult {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  responseTimeMs: number;
  isUp: boolean;
  isHttps: boolean;
  redirected: boolean;
  error: string | null;
}

export async function runHttpCheck(rawUrl: string): Promise<HttpCheckResult> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const isHttps = url.startsWith("https://");
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "EyeOfHorus-Monitor/2.0 (+https://wetpaint.co.za)",
      },
    });

    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;

    return {
      url,
      finalUrl: response.url || url,
      httpStatus: response.status,
      responseTimeMs,
      isUp: response.status < 400,
      isHttps,
      redirected: response.redirected,
      error: null,
    };
  } catch (err: any) {
    const responseTimeMs = Date.now() - start;
    const isTimeout = err.name === "AbortError";
    return {
      url,
      finalUrl: null,
      httpStatus: null,
      responseTimeMs,
      isUp: false,
      isHttps,
      redirected: false,
      error: isTimeout ? "Timeout after 15s — site may be down" : err.message,
    };
  }
}
