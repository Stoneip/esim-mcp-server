#!/usr/bin/env node
/**
 * esim-mcp-server — Model Context Protocol server for ALT eSIM (altesim.com).
 *
 * Lets any MCP client (Claude Desktop, Claude Code, ChatGPT custom connectors,
 * coding agents) search and buy travel data eSIMs. Thin client over the public
 * ALT eSIM API — no API key required for browsing; buying returns a Stripe
 * payment link the buyer opens (the agent never handles card data).
 *
 * Config (env):
 *   ALTESIM_API_BASE   override the API base (default https://altesim.com)
 *
 * All prices are USD. eSIMs are data-only and need no real-name registration.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = (process.env.ALTESIM_API_BASE || "https://altesim.com").replace(/\/$/, "");
const VERSION = "0.1.0";

interface CatalogPlan {
  id: string;
  sku: string;
  title: string;
  country: string;
  countryIso: string | null;
  region: string;
  dataAmount: string;
  validityDays: number;
  priceUSD: number;
  currency: string;
  carriers: string[];
  productUrl: string;
}
interface Catalog {
  plans: CatalogPlan[];
  destinations: { slug: string; name: string; region: string; url: string }[];
}

let cache: { at: number; data: Catalog } | null = null;
const TTL = 5 * 60 * 1000;

async function getCatalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const res = await fetch(`${API_BASE}/api/catalog`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as Catalog;
  cache = { at: Date.now(), data };
  return data;
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const server = new McpServer({ name: "esim-mcp-server", version: VERSION });

server.tool(
  "list_destinations",
  "List all ALT eSIM destinations (country/region slugs, English names, region). Use a slug as the 'country' argument for other tools.",
  {},
  async () => {
    const c = await getCatalog();
    return text({ count: c.destinations.length, destinations: c.destinations });
  },
);

server.tool(
  "search_plans",
  "Search ALT eSIM travel data plans. Filter by destination country slug (e.g. 'japan', 'usa'), region, and/or max USD price. Returns sku, data amount, validity days, USD price and coverage carriers.",
  {
    country: z.string().optional().describe("Destination slug, e.g. 'japan', 'thailand', 'usa'."),
    region: z
      .enum(["asia", "europe", "americas", "oceania", "africa", "middle-east"])
      .optional(),
    max_price_usd: z.number().optional(),
  },
  async ({ country, region, max_price_usd }) => {
    const c = await getCatalog();
    let plans = c.plans;
    if (country) plans = plans.filter((p) => p.country === country.toLowerCase());
    if (region) plans = plans.filter((p) => p.region === region);
    if (typeof max_price_usd === "number") plans = plans.filter((p) => p.priceUSD <= max_price_usd);
    plans = plans.sort((a, b) => a.priceUSD - b.priceUSD);
    return text({ currency: "USD", count: plans.length, plans });
  },
);

server.tool(
  "recommend_plan",
  "Recommend the best-value ALT eSIM for a destination. Given a country (and optional trip length / data need), returns the cheapest suitable plan plus a few alternatives. Prices in USD.",
  {
    country: z.string().describe("Destination slug, e.g. 'japan'. Use list_destinations to discover slugs."),
    days: z.number().optional().describe("Trip length in days — prefers plans with at least this validity."),
  },
  async ({ country, days }) => {
    const c = await getCatalog();
    const all = c.plans.filter((p) => p.country === country.toLowerCase()).sort((a, b) => a.priceUSD - b.priceUSD);
    if (all.length === 0) {
      const known = c.destinations.map((d) => d.slug).join(", ");
      return fail(`No plans for "${country}". Known destinations: ${known}`);
    }
    const suitable = typeof days === "number" ? all.filter((p) => p.validityDays >= days) : all;
    const recommended = (suitable[0] || all[0]);
    return text({
      currency: "USD",
      recommended,
      reason:
        typeof days === "number"
          ? `Cheapest plan covering at least ${days} day(s) in ${country}.`
          : `Cheapest plan for ${country}.`,
      alternatives: all.slice(0, 5).filter((p) => p.id !== recommended.id),
      next_step: "Call buy_esim with the plan's sku and the buyer's email.",
    });
  },
);

server.tool(
  "get_plan",
  "Get one ALT eSIM plan by its sku or id.",
  { sku_or_id: z.string() },
  async ({ sku_or_id }) => {
    const c = await getCatalog();
    const low = sku_or_id.toLowerCase();
    const p = c.plans.find((x) => x.sku.toLowerCase() === low || x.id.toLowerCase() === low);
    if (!p) return fail(`No plan found for "${sku_or_id}".`);
    return text(p);
  },
);

server.tool(
  "buy_esim",
  "Create a secure Stripe payment link for an ALT eSIM plan. Returns a URL the BUYER opens to pay (the agent never handles card details). After payment the eSIM QR code is emailed to the buyer within ~1 minute. Charged in USD. You MUST collect the buyer's real email — that is where the eSIM is delivered.",
  {
    sku_or_id: z.string().describe("The plan sku or id to buy."),
    email: z.string().describe("Buyer's email — the eSIM QR code is sent here."),
    lang: z.enum(["en", "zh-hk", "zh-cn", "id", "hi", "es", "fr", "nl"]).optional(),
  },
  async ({ sku_or_id, email, lang }) => {
    if (!EMAIL_RE.test(email.trim()))
      return fail("A valid buyer email is required — the eSIM QR code is delivered there.");
    // Reuse the hosted MCP's create_checkout (no backend duplication).
    const res = await fetch(`${API_BASE}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_checkout", arguments: { sku_or_id, email: email.trim(), lang } },
      }),
    });
    const j = (await res.json()) as {
      error?: { message?: string };
      result?: { content?: { text?: string }[]; isError?: boolean };
    };
    if (j.error) return fail(`Checkout error: ${j.error.message || "unknown"}`);
    const out = j.result?.content?.[0]?.text;
    if (!out) return fail("Could not create a payment link. Please try again.");
    return { content: [{ type: "text" as const, text: out }], isError: j.result?.isError };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP transport channel.
  console.error(`esim-mcp-server v${VERSION} ready (API: ${API_BASE})`);
}

main().catch((e) => {
  console.error("esim-mcp-server fatal:", e);
  process.exit(1);
});
