# TOOKIE — Username & Social Footprint (Orchestrator Module)

**Copyright (c) 2026 Edward Marin. All rights reserved. Proprietary Orchestrator integration.**

**Upstream engine:** [Tookie-OSINT](https://github.com/Alfredredbird/tookie-osint) — username discovery across public sites (Sherlock-style).

**Tagline:** *Find the handle. Map the presence. Feed the ring.*

---

## What It Is

TOOKIE is Orchestrator's **username / social-handle OSINT module**. Given a handle, it scans hundreds of public sites for matching accounts and returns structured hits for **PROVISO CIRCL** dossiers — officers, **confidants**, and **associates**.

Public presence only. No password cracking, no private account access.

---

## Stack placement

```
PROVISO CIRCL dossier (officer / confidant / associate)
        ↓
TOOKIE username scan (known or suspected handle)
        ↓
Social footprint → context_notes / alias list / Ring dossier
```

Pairs with **PHONEINFOGA** (line) + **CIRCL** (people):

| Layer | Tool |
|-------|------|
| Person | CIRCL dossier |
| Phone | PHONEINFOGA |
| Username / social | TOOKIE |

---

## Setup (self-hosted engine)

### 1. Install Tookie-OSINT (Windows / manual)

```powershell
git clone https://github.com/alfredredbird/tookie-osint
cd tookie-osint
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Entry script: `brib.py` (CLI / headless-capable)

### 2. Orchestrator env

```bash
# .env.local
TOOKIE_ROOT=C:\path\to\tookie-osint
TOOKIE_PYTHON=C:\path\to\tookie-osint\venv\Scripts\python.exe
TOOKIE_DEFAULT_THREADS=8
```

### 3. Registry seed

Run `supabase/tookie.sql` in Supabase SQL Editor.

---

## Agent tool: `tookie`

| Action | Description |
|--------|-------------|
| `health` | Verify TOOKIE_ROOT + Python + brib.py |
| `scan` | Username scan → JSON hits |
| `footprint_report` | Markdown report for CIRCL attach |
| `scan_aliases` | Scan multiple handles (comma-separated) |

### CLI equivalent (upstream)

```bash
python brib.py -u alfred -o json -t 10 --skipheaders
```

Orchestrator runs this headlessly with `--skipheaders` and auto-declines interactive header download.

### Example agent prompts

- *"TOOKIE footprint_report on username jsmith for confidant dossier"*
- *"Scan aliases marin, manuelmarin for CIRCL associate ring"*

---

## API

`POST /api/tookie/scan`

```json
{
  "action": "footprint_report",
  "username": "example_handle",
  "subject_name": "Manuel Marin",
  "threads": 8
}
```

---

## CIRCL workflow

1. Officer dossier created  
2. Confidant associate added — note suspected **username / alias** in context  
3. `tookie` → `footprint_report`  
4. Merge hits into associate `context_notes`  
5. `proviso_circl` → `get_network`  

**Confidant layer:** everyone has a confidant — they often leave a **public handle trail** on the same platforms.

---

## Anti-features

| Not allowed | Note |
|-------------|------|
| Accessing private/DM content | Public URL existence checks only |
| Harassment / stalking workflows | Lawful OSINT only |
| Claiming account ownership proof | Handle match ≠ identity proof |

---

## Upstream notes

- Tookie V4 is a rewrite; use **stable main branch** releases for production.
- Webscraper mode (`-W`) uses Selenium — slower; default scan is threaded HTTP.
- GPL/MIT — verify upstream license on release; Orchestrator wrapper is proprietary IP.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `TOOKIE_ROOT not set` | Add path in `.env.local` |
| Header download prompt | Orchestrator passes `n` automatically; use `--skipheaders` |
| Slow scan | Lower threads or reduce site list in upstream `sites.json` |
| Empty results | Username may not exist on scanned sites (~80% hit rate per upstream) |