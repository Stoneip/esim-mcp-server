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
| `buy_esim` | Stripe payment link for a plan (needs buyer `email`); returns a `checkout_session_id` |
| `get_qr_code` | Fetch the eSIM QR image(s) for a paid order by `checkout_session_id` — show them to the buyer directly |

### Recommended agent flow
1. `recommend_plan` (or `search_plans`) → pick a plan
2. `buy_esim` with the plan’s `sku` and the buyer’s `email` → returns a payment link + `checkout_session_id`
3. Buyer opens the link and pays
4. `get_qr_code` with the `checkout_session_id` → the AI shows the eSIM QR image right in the chat (also emailed to the buyer)

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
- After payment, `get_qr_code` returns the QR image(s) so the agent can show them in-chat; the QR is also emailed to the buyer.

## Install from MCP directories

This server is published to npm and listed in MCP registries, so you can install it from:

- **npm**: `npm i -g esim-mcp-server` or just `npx -y esim-mcp-server`
- **Smithery** (smithery.ai) — one-click install
- **MCP Registry** (`io.github.stoneip/esim-mcp-server`), and auto-indexed by Glama / PulseMCP / mcp.so

## Develop

```bash
npm install
npm run build
npm start
```

## License

MIT — see [LICENSE](./LICENSE).
