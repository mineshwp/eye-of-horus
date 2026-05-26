import crypto from 'crypto';

export async function getGoogleAccessToken(scopes: string[]): Promise<string | null> {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  try {
    const sa = JSON.parse(json) as {
      client_email: string;
      private_key: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: scopes.join(' '),
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      }),
    ).toString('base64url');

    const unsigned = `${header}.${claim}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const sig = signer.sign(sa.private_key, 'base64url');
    const assertion = `${unsigned}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!res.ok) {
      console.error('[google-auth] Token exchange failed:', await res.text());
      return null;
    }

    const data = await res.json() as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.error('[google-auth] JWT error:', err);
    return null;
  }
}
