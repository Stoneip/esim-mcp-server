# esim-mcp-server

**The AI-native eSIM connector.** A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude, ChatGPT and coding agents **search and buy travel data eSIMs** from [ALT eSIM](https://altesim.com) — 200+ destinations, instant QR delivery, data-only, no real-name registration. All prices in **USD**.

No API key needed to browse. Buying returns a **Stripe payment link** the buyer opens — the agent never touches card data.

## 5-minute quickstart

### Claude Code
```bash
claude mcp add esim -- npx -y esim-mcp-server
```

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "esim": { "command": "npx", "args": ["-y", "esim-mcp-server"] }
  }
}
```

### Any MCP client (stdio)
```bash
npx -y esim-mcp-server
```

Then just ask: *“I’m going to Japan for 7 days — find me an eSIM.”*

## Tools

| Tool | What it does |
|------|--------------|
| `list_destinations` | All destinations (slugs + names + region) |
| `search_plans` | Filter plans by `country`, `region`, `max_price_usd` |
| `recommend_plan` | Best-value plan for a `country` (+ optional `days`) |
| `get_plan` | One plan by `sku` or `id` |
| `buy_esim` | Stripe payment link for a plan (needs buyer `email`); eSIM QR is emailed after payment |

### Recommended agent flow
1. `recommend_plan` (or `search_plans`) → pick a plan
2. `buy_esim` with the plan’s `sku` and the buyer’s `email`
3. Hand the buyer the returned Stripe link — the eSIM QR arrives by email within ~1 minute

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `ALTESIM_API_BASE` | `https://altesim.com` | Override the API base (e.g. for staging) |

## How it works

This package is a thin [stdio](https://modelcontextprotocol.io/docs/concepts/transports) MCP server over the public ALT eSIM API:

- Browsing reads the open catalog: `GET https://altesim.com/api/catalog`
- `buy_esim` calls the hosted MCP `create_checkout`, which returns a Stripe Checkout link

A hosted (remote) MCP endpoint is also available if you prefer no install: `https://altesim.com/api/mcp` (Streamable HTTP).

## Notes

- Prices and checkout are always **USD**.
- eSIMs are **data-only** — no phone number, no calls/SMS (use WhatsApp/LINE over data).
- The eSIM QR code is delivered to the buyer's email; it is not returned to the agent.

## Develop

```bash
npm install
npm run build
npm start
```

## License

MIT — see [LICENSE](./LICENSE).
