/**
 * SSRF protection: only allow requests to public web servers.
 *
 * Without this, a user could make OUR server fetch http://localhost:8000
 * or a cloud metadata address and read the response.
 *
 * Known limitation: DNS is resolved here and again by fetch(), so a hostile
 * DNS server could answer differently the second time (DNS rebinding).
 * For stronger protection, run these tools in a network-isolated service.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import { ToolError } from "./errors";

const NOT_ALLOWED = "That address is not allowed";
const ALLOWED_PORTS = new Set(["", "80", "443"]); // "" = default port
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal"];

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 || // multicast and reserved
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) {
    const mapped = v.slice(7); // IPv4 address inside an IPv6 one
    return net.isIPv4(mapped) ? isPrivateIpv4(mapped) : true;
  }
  return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

export function isPrivateIp(ip: string): boolean {
  return net.isIPv4(ip) ? isPrivateIpv4(ip) : isPrivateIpv6(ip);
}

/** Turns user input like "example.com" into a URL object, or throws. */
export function normalizeUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new ToolError("Enter a valid URL");
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ToolError("Enter a valid URL");
  }
}

/** Throws unless the URL points at a public http(s) server on a standard port. */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolError("Only http and https URLs are allowed");
  }
  if (!ALLOWED_PORTS.has(url.port)) throw new ToolError("Only standard web ports are allowed");

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ToolError(NOT_ALLOWED);
  }

  let addresses: { address: string }[];
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new ToolError("Could not find that domain");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new ToolError(NOT_ALLOWED);
  }
}