# PROVISO — Proprietary Virtual Intelligence & Structured Operations

**Tagline:** *Disciplined work. Agent-assisted. Yours alone when it must be.*

**Copyright (c) 2026 Edward Marin. All rights reserved. Proprietary Orchestrator module.**

---

## What PROVISO Is

PROVISO is Orchestrator's proprietary **disciplined workspace**. It gives the agent enough context to assist you — without surveillance of your entire machine.

| Zone | Purpose | Agent access |
|------|---------|--------------|
| **Shared Work** | Daily work you choose to collaborate on | ✅ Read |
| **Briefcase** | One critical file for the present job | ✅ Read |
| **Private Vault** | Personal / sensitive — password encrypted | ❌ **Permanently blocked** |
| **Encrypted Grants** | One-off extended access (file/folder/search) | ⚠️ User-approved token only |

---

## Setup

1. Run `supabase/proviso.sql` in your Supabase SQL Editor (after `schema.sql`).
2. Open **https://localhost:3000/proviso** (or your deployment URL).
3. Optional: set `PROVISO_GRANT_SECRET` in `.env.local` for production permission tokens.

---

## Daily Discipline (End User)

| When | Action |
|------|--------|
| During the day | Place work you're willing to share in **Shared Work** |
| Before a meeting / flight | Attach **one file** to **Briefcase** |
| Sensitive material | Store only in **Private Vault** (your password) |
| End of day (5 min) | Drop today's outcomes → **Generate EOD Brief** |

---

## EOD Brief Format (Canonical)

Every PROVISO End-of-Day brief uses **exactly these sections**. This is what buyers ship to teams and what the agent generates.

```markdown
# PROVISO End-of-Day Brief — YYYY-MM-DD

## Headline
One sentence: what today amounted to in Shared Work.

## Completed Today
- Item placed in Shared Work with outcome noted
- (bullet per entry or synthesized completion)

## Still Open
- Work started but not closed
- Items the user did not move to Shared Work (discipline gap callout)

## Connections
- How today's items link to projects, meetings, or prior EOD briefs
- Cross-references the agent can use tomorrow

## Tomorrow Focus
- Up to 3 specific actions (not vague)
- Include Briefcase prep if a live job is upcoming

## Discipline Note
Reminder: Private Vault is invisible to the agent. Shared Work is the teaching signal.
```

### Example

```markdown
# PROVISO End-of-Day Brief — 2026-06-16

## Headline
You closed Acme redlines and queued Thursday's board prep in Shared Work.

## Completed Today
- Acme MSA v4 redlines — indemnity section tightened
- Pipeline Q2 slide — added metals hedge note

## Still Open
- Board deck final sign-off not yet in Shared Work

## Connections
- Acme work feeds Thursday Briefcase (attach final PDF before 9am)
- Pipeline Q2 links to PROVISO tag `fundraising`

## Tomorrow Focus
- Drop board deck into Shared Work before EOD
- Attach Acme final to Briefcase before 9:00 meeting
- Generate EOD brief before close (5 min)

## Discipline Note
Private Vault entries are invisible to the agent by design.
```

---

## Buyer Onboarding Flow (Week 1)

Ship this to purchasers who productize PROVISO for their teams.

### Day 0 — Install & trust

1. Run `proviso.sql` migration.
2. Show the **two-zone model** slide: Shared Work vs Private Vault.
3. State the promise: *"The agent only knows what you teach it on schedule."*
4. Demo **agent blocked from vault** (`403 AGENT_ACCESS_DENIED`).

### Day 1 — Shared Work habit

- Task: each user adds **one** Shared Work entry before lunch.
- Success metric: 80% of pilot users have ≥1 entry.
- Agent prompt to try: *"Use PROVISO read_context — what's my active work?"*

### Day 2 — Briefcase for live moments

- Task: attach one file to Briefcase before any scheduled call.
- Teach: Briefcase = **one file**, not a folder.
- Agent prompt: *"Summarize my Briefcase for this meeting."*

### Day 3 — Private Vault boundary

- Task: store one intentionally private note in Vault.
- Confirm: agent `proviso` tool returns *ACCESS DENIED* for vault.
- Message: *"Your line. Cryptographically enforced."*

### Day 4 — EOD ritual

- Task: full team runs **Generate EOD Brief** within 30 min of close.
- Share one anonymized EOD brief in standup next morning.
- Track: EOD briefs generated / active users.

### Day 5 — Encrypted grants (optional tier)

- Demo: user approves a 15-minute `single_file` grant from phone.
- Explain: grants are signed tokens — not standing PC access.

### Week 2+ — Scale

| KPI | Target |
|-----|--------|
| EOD brief completion | ≥4 days/week per active user |
| Shared Work entries/week | ≥5 per user |
| Briefcase before meetings | ≥90% of calendar blocks with docs |
| Vault misuse attempts by agent | 0 (should always 403) |

### Buyer positioning copy

> **PROVISO** is the disciplined AI workstation inside Orchestrator. Teams get an assistant that learns from **what they choose to share** — not from reading every file on disk. Private Vault stays yours alone. Included with full Orchestrator purchase.

---

## PROVISO CIRCL — Officers + Associates

**CIRCL** = *Corporate & Relational Intelligence Context Layer*

Dossiers are not limited to corporate officers. Three subject types:

| Type | Use for |
|------|---------|
| `corporate_officer` | CEO, CFO, director, founder, named executive |
| `associate` | Business partner, co-founder, board peer, legal co-party, family in deal context, advisor, vendor contact |
| `organization` | Company / entity anchor for spiderweb-style mapping |

**Associate ring workflow:**
1. Create **corporate_officer** dossier (primary)
2. Create **associate** dossiers with `parent_dossier_id` + `relationship_type`
3. Click **Ring** to generate merged **Network Dossier**

**Relationship types:** `confidant` (inner circle — **everyone has one, map first**), `business_partner`, `co_founder`, `board_peer`, `family`, `legal_co_party`, `vendor_contact`, `advisor`, `employee`, `investor`, `other`

### The Confidant Layer

CIRCL assumes every corporate officer has at least one confidant — the person they trust with decisions, stress, and strategy. Network dossiers surface a dedicated **Confidant Layer** section. If none is linked, the ring reports `UNMAPPED` until you add an associate with `relationship_type: confidant`.

**Recommended order:** Officer → Confidant → other associates → Ring.

**Setup:** Run `supabase/proviso_dossier.sql` after `proviso.sql`

**UI:** `/proviso` → **CIRCL Dossiers** tab

---

## Agent Tools

### `proviso`

| Action | Description |
|--------|-------------|
| `read_context` | Shared Work (today) + Briefcase |
| `generate_eod` | Build and save EOD brief from Shared Work |
| `workflow_summary` | Narrative of recent workflow + last EOD |

**Hard rule:** Agent headers with `x-proviso-caller: agent` are rejected from Vault and write endpoints.

### `proviso_circl`

| Action | Description |
|--------|-------------|
| `create_dossier` | Officer, associate, or organization — public OSINT synthesis |
| `list_dossiers` | Filter by `subject_type` |
| `get_network` | Merged associate ring for a primary dossier |
| `link_subjects` | Link two existing dossiers with `relationship_type` |

**Example agent task:**
> Create corporate_officer dossier for [Name], then create associate dossiers for [Partner A] and [Partner B] as business_partner and legal_co_party, then get_network.

---

## API Routes

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/proviso/shared` | GET, POST | Agent read OK; agent write blocked |
| `/api/proviso/briefcase` | GET, POST, DELETE | One file per user |
| `/api/proviso/vault` | GET, POST, DELETE | User only — agent always 403 |
| `/api/proviso/eod` | GET, POST | Generate / fetch EOD brief |
| `/api/proviso/permissions` | POST | User-approved encrypted grants |
| `/api/proviso/dossier` | GET, POST, DELETE | CIRCL dossiers + network + links |

---

## Included with Orchestrator

PROVISO is proprietary IP — same ownership model as Orchestra Tool, the five engines, and HEKA. Full source included with complete platform purchase.