import { createHash, randomUUID } from "node:crypto";

const TEN_MINUTES = 10 * 60 * 1000;
const CONFIRMATION_LEASE_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 4096;

/** Per-process protection is always on, including dev and missing Redis config. */
export function createWaitlistRateLimiter({
  now = Date.now,
  windowMs = TEN_MINUTES,
  perClient = 5,
  total = 100,
  maxClients = 1024,
} = {}) {
  const clients = new Map();
  let globalBucket = { count: 0, reset: 0 };

  return function limit(client) {
    const time = now();
    if (time >= globalBucket.reset) {
      globalBucket = { count: 0, reset: time + windowMs };
    }
    const key = createHash("sha256").update(client).digest("hex");
    let bucket = clients.get(key);
    if (bucket && time >= bucket.reset) {
      clients.delete(key);
      bucket = undefined;
    }
    if (!bucket && clients.size >= maxClients) {
      for (const [storedKey, storedBucket] of clients) {
        if (time >= storedBucket.reset) clients.delete(storedKey);
      }
    }
    // Never evict active buckets: doing so would let rotating clients reset limits.
    if (!bucket && clients.size >= maxClients) {
      return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
    }
    if (!bucket) {
      bucket = { count: 0, reset: time + windowMs };
      clients.set(key, bucket);
    }
    if (bucket.count >= perClient || globalBucket.count >= total) {
      const reset = bucket.count >= perClient ? bucket.reset : globalBucket.reset;
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((reset - time) / 1000)) };
    }
    bucket.count += 1;
    globalBucket.count += 1;
    return { allowed: true, retryAfter: 0 };
  };
}

function clientIdentifier(request) {
  // Production must have its reverse proxy replace, rather than append untrusted,
  // client-IP headers. The global bucket still bounds callers rotating headers.
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  ).slice(0, 128);
}

function validateSignup(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (typeof body.email !== "string") return null;
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(email)) {
    return null;
  }
  const [local, domain] = email.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return null;
  }
  if (domain.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }
  const signup = { email, product: null, source: "landing" };
  for (const field of ["product", "source"]) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string" || body[field].length > 100) return null;
    signup[field] = body[field].trim() || (field === "source" ? "landing" : null);
  }
  return signup;
}

async function readSignup(request) {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return validateSignup(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

const escapeHtml = (text) => text.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Repository claims are atomic database operations, never an in-memory lock. */
export function createWaitlistHandler({
  enabled,
  repository,
  sendEmail,
  appName = "Your App",
  limit = createWaitlistRateLimiter(),
  now = () => new Date(),
  newToken = randomUUID,
  onError = () => {},
}) {
  return async function handleSignup(request) {
    if (!enabled()) return json({ error: "Waitlist is not available" }, 404);
    const result = limit(clientIdentifier(request));
    if (!result.allowed) {
      return json({ error: "Too many requests. Please try again later." }, 429, {
        "Retry-After": String(result.retryAfter),
      });
    }
    const data = await readSignup(request);
    if (!data) return json({ error: "Please enter a valid email address" }, 400);

    let signup;
    let token;
    let delivered = false;
    try {
      signup = await repository.ensureSignup(data);
      if (signup.confirmationSentAt) return json({ success: true });
      token = newToken();
      const claimedAt = now();
      const claimed = await repository.claimConfirmation(
        signup.id, token, claimedAt, new Date(claimedAt.getTime() - CONFIRMATION_LEASE_MS)
      );
      if (!claimed) {
        return json({ error: "Confirmation is being sent. Please try again shortly." }, 503, {
          "Retry-After": "30",
        });
      }
      const text = `You're on the ${appName} waitlist.\n\nWe'll email you when there is news about the launch.`;
      await sendEmail(data.email, `You're on the ${appName} waitlist`,
        `<p>You're on the ${escapeHtml(appName)} waitlist.</p><p>We'll email you when there is news about the launch.</p>`, text);
      delivered = true;
      await repository.markConfirmationSent(signup.id, token, now());
      return json({ success: true });
    } catch (error) {
      // Keep uncertain, already-delivered attempts leased. A mail-provider timeout
      // can be ambiguous; the database marker prevents all known-success repeats.
      if (signup && token && !delivered) {
        try {
          await repository.releaseConfirmation(signup.id, token);
        } catch {
          // An abandoned lease becomes retryable after five minutes.
        }
      }
      onError(error);
      return json({ error: "Unable to send your confirmation. Please try again shortly." }, 503, {
        "Retry-After": "30",
      });
    }
  };
}
