/**
 * ssrfGuard.js — SSRF protection utilities.
 *
 * Two exported strategies, each matched to its caller's threat model:
 *
 *   assertSafeExternalUrl(url)      — blocklist approach (menu.js).
 *     Blocks private/internal IPs, loopback, link-local, bad protocols.
 *     Resolves the hostname via DNS and checks the resulting IP(s) directly,
 *     defeating DNS-rebinding.  Callers re-invoke this on every redirect hop.
 *
 *   checkManufacturerUrl(url)       — allowlist approach (batchIngestor.js).
 *     Only manufacturer domains from ALLOWED_MANUFACTURER_HOSTS are permitted.
 *     Returns { allowed, hostname, reason } — never throws.
 *     To add a new manufacturer: add their hostname to ALLOWED_MANUFACTURER_HOSTS
 *     and create the corresponding manufacturer_registry DB row.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIPv4, isIPv6 }      from 'node:net';

// ── Private / internal IP ranges ──────────────────────────────────────────────

function isPrivateIP(ip) {
  if (isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 127)                          return true; // 127.0.0.0/8 loopback
    if (a === 10)                           return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31)   return true; // 172.16.0.0/12
    if (a === 192 && b === 168)             return true; // 192.168.0.0/16
    if (a === 169 && b === 254)             return true; // 169.254.0.0/16 link-local
    if (a === 0)                            return true; // 0.0.0.0/8 unspecified
    if (a === 100 && b >= 64 && b <= 127)  return true; // 100.64.0.0/10 shared
    if (a === 198 && b === 18)             return true; // 198.18.0.0/15 benchmark
    if (a === 240)                          return true; // 240.0.0.0/4 reserved
    if (a === 255)                          return true; // broadcast
    return false;
  }
  if (isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::')            return true; // loopback / unspecified
    if (norm.startsWith('::ffff:')) {               // IPv4-mapped — check the embedded IPv4
      const v4 = norm.slice(7);
      if (isIPv4(v4)) return isPrivateIP(v4);
    }
    if (/^fe[89ab]/i.test(norm))                    return true; // fe80::/10 link-local
    if (/^f[cd]/i.test(norm))                       return true; // fc00::/7 unique-local (ULA)
    if (/^64:ff9b::/i.test(norm))                   return true; // 64:ff9b::/96 NAT64
    return false;
  }
  return true; // unknown format — block by default
}

// ── DNS resolution check ───────────────────────────────────────────────────────

async function assertHostNotPrivate(hostname) {
  // IP literals bypass DNS — check directly
  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(`direct IP ${hostname} is in a private/reserved range`);
    }
    return;
  }

  let results;
  try {
    results = await dnsLookup(hostname, { all: true });
  } catch (err) {
    throw new Error(`DNS resolution failed for "${hostname}": ${err.message}`);
  }
  if (!results.length) {
    throw new Error(`DNS returned no addresses for "${hostname}"`);
  }
  for (const { address } of results) {
    if (isPrivateIP(address)) {
      throw new Error(`"${hostname}" resolves to private IP ${address}`);
    }
  }
}

// ── assertSafeExternalUrl — blocklist strategy ─────────────────────────────────
// Use for user-supplied URLs (menu scraping).
// Throws a descriptive Error if the URL is unsafe.

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export async function assertSafeExternalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    throw new Error(`invalid URL: ${rawUrl}`);
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`protocol "${parsed.protocol}" is not allowed — use http or https`);
  }
  await assertHostNotPrivate(parsed.hostname);
}

// ── ALLOWED_MANUFACTURER_HOSTS — allowlist strategy ────────────────────────────
// Sources: api/db/migrations/007_batch_ingestion.sql + batchIngestor fallback.
// To add a manufacturer: append their hostname here AND add a manufacturer_registry row.

export const ALLOWED_MANUFACTURER_HOSTS = new Set([
  'seach.co.il',
  'peacenaturals.co.il',
  'canndoc.co.il',
  'tikun-olam.co.il',
  'bazelet.co.il',
  'imc-group.com.au',        // IMC — Israeli company, Australian domain
  'cnc.org.il',
  'canabeer.co.il',
  'gemmacert.com',            // GemmaCert — COA certification platform
  'solo-cannabis.co.il',
  'together.co.il',
  'pharmaseach.co.il',
  'greenmediterra.co.il',
  'tevanatur.co.il',
]);

/**
 * Check a manufacturer URL against the allowlist.
 * Returns { allowed: true } or { allowed: false, hostname, reason }.
 * Never throws — caller decides whether to skip or abort.
 *
 * @param {string} rawUrl
 * @returns {{ allowed: boolean, hostname?: string, reason?: string }}
 */
export function checkManufacturerUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return { allowed: false, hostname: String(rawUrl), reason: 'invalid_url' };
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    return { allowed: false, hostname: parsed.hostname, reason: 'bad_protocol' };
  }
  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (ALLOWED_MANUFACTURER_HOSTS.has(hostname)) return { allowed: true };
  return { allowed: false, hostname, reason: 'not_in_allowlist' };
}
