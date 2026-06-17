# PHONEINFOGA — Line Intelligence & Number Footprint (Orchestrator Module)

**Copyright (c) 2026 Edward Marin. All rights reserved. Proprietary Orchestrator integration.**

**Upstream engine:** [PhoneInfoga](https://github.com/sundowndev/phoneinfoga) (GPL-3.0) — self-hosted OSINT framework for phone numbers.

**Tagline:** *Map the line. Footprint the number. Feed the ring.*

---

## What It Is

PHONEINFOGA is Orchestrator's **phone-line OSINT module**. It validates international numbers, runs configured scanners (carrier, line type, Google dorks, reputation, social footprints), and returns structured intelligence the agent can attach to **PROVISO CIRCL** dossiers — especially **confidants** and **associates**.

It does **not** track phones in real time, hack devices, or claim verified identity. It gathers **public OSINT** the same way the upstream tool does.

---

## Fits in the stack

```
PROVISO CIRCL dossier (officer / associate / confidant)
        ↓
PHONEINFOGA scan (optional phone number on subject)
        ↓
Footprint appended to dossier context_notes / agent memory
```

**Everyone has a confidant** — confidants often share a **reachable line**. PHONEINFOGA maps that layer when you have a lawful reason and a number to investigate.

---

## Setup (self-hosted engine)

### 1. Run PhoneInfoga (Docker — recommended)

```bash
docker run --rm -it -p 5000:5000 sundowndev/phoneinfoga serve
```

Or install from [official docs](https://sundowndev.github.io/phoneinfoga/getting-started/install/).

### 2. Configure scanners

PhoneInfoga requires scanner API keys (Numverify, etc.) in its own config. See upstream documentation.

### 3. Orchestrator env

```bash
# .env.local
PHONEINFOGA_API_URL=http://localhost:5000
```

### 4. Tools registry (optional)

Run `supabase/phoneinfoga.sql` or let the agent sync register `phoneinfoga` on first run.

---

## Agent tool: `phoneinfoga`

| Action | Description |
|--------|-------------|
| `validate` | E.164 validation + carrier/country/line metadata |
| `list_scanners` | Available scanners on your PhoneInfoga instance |
| `run_scanner` | Run one scanner by name |
| `full_scan` | Validate + run all available scanners |
| `footprint_report` | Markdown report for CIRCL / dossier attach |

### Example prompts

- *"PHONEINFOGA full_scan on +13055551234 and summarize for CIRCL"*
- *"Validate this line and list scanners"*
- *"Run googlesearch scanner on the confidant's number from the Marin dossier"*

---

## API route

`POST /api/phoneinfoga/scan`

```json
{
  "phone_number": "+13055551234",
  "action": "full_scan"
}
```

---

## Anti-features (hard rules)

Orchestrator inherits PhoneInfoga's limits and adds purchaser policy:

| Not allowed | Why |
|-------------|-----|
| Real-time GPS tracking | Not technically supported; not permitted |
| Hacking / intercepting calls | Illegal |
| Stalking or harassment workflows | Out of scope |
| Claiming 100% owner identity | OSINT is probabilistic |

Use only with **lawful purpose**: due diligence, your own contacts, consented investigations, security research on numbers you own or are authorized to check.

---

## CIRCL integration pattern

1. Create **corporate_officer** dossier  
2. Create **confidant** associate  
3. If you hold a number **in Shared Work / user context** (never from Private Vault without user export), run `phoneinfoga` → `footprint_report`  
4. Paste result into associate `context_notes` or agent `save_memory`  
5. Regenerate **Ring** dossier  

---

## License note

PhoneInfoga engine is **GPL-3.0**. Orchestrator's wrapper (client, agent tool, API route, this doc) is proprietary Orchestrator IP. Purchasers who distribute combined systems should comply with GPL for the PhoneInfoga component when shipping the engine binary/container.

---

## Health check

```bash
curl http://localhost:5000/api/
```

Expect `{"success":true,...}` when the engine is up.