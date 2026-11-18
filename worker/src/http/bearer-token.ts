// ---------------------------------------------------------------------------
// A shared secret for /mcp, sent as "Authorization: Bearer <token>".
//
// Enough for a public demo: the endpoint is not open to everyone, and the
// token can be rotated with one `wrangler secret put MCP_TOKEN`. OAuth would
// be the next step for real users (see docs/mcp-usage.md).
// ---------------------------------------------------------------------------

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1]!.trim() : null;
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * Compares two tokens in constant time. Both are hashed first, so the
 * comparison always looks at 32 bytes and leaks neither length nor content
 * through timing.
 */
export async function tokensMatch(providedToken: string, expectedToken: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([sha256(providedToken), sha256(expectedToken)]);
  let difference = 0;
  for (let index = 0; index < providedHash.length; index += 1) {
    difference |= providedHash[index]! ^ expectedHash[index]!;
  }
  return difference === 0;
}
