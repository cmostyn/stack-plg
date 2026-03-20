# stack-plg — project context

## What this is
An internal PLG dashboard at stack-plg.pages.dev for StackOne's CS team and
leadership. Shows a live picture of how the PLG motion is going — product
usage, customer growth, support health, and what actions need to happen.

Audience: CS team and leadership. Not customer-facing.

---

## Skills — run all three at the start of every session

/stackone-brand       ← colour tokens, typography, spacing — use exactly as defined
/stackone-design      ← component patterns, layouts, UI conventions
/natural-writing      ← copy rules — run /review-copy before any text goes live

Do not write any code or copy until all three are confirmed loaded.

---

## Repo

GitHub: https://github.com/cmostyn/stack-plg
Live site: https://stack-plg.pages.dev

---

## Repo structure

```
stack-plg/
  site/          ← all frontend code lives here
  scripts/       ← utility scripts
  templates/     ← HTML templates
  publish.js     ← automation script (copy file → update manifest → push)
  package.json
  .env.example   ← API keys go here, never committed
```

---

## Tech stack

- HTML / CSS / JavaScript — keep it simple, no heavy framework unless needed
- Tailwind v4 (CSS-first, no config file) for styling
- React Islands (Vite) — static HTML shell, React only for charts and
  interactive components
- Apache ECharts for all data visualisation
  CDN: https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js
- Cloudflare Pages — connected to this GitHub repo, auto-deploys on push

---

## Design

Follow /stackone-brand and /stackone-design exactly. When in doubt,
reference stackone.com — that's the visual standard.

Key tokens:
- Background: #FEFEFD
- Headers: #222121
- Body text: #4C4B4B
- Brand green (CTAs, positive): #00AF66
- Dark green (hover): #047B43
- Warm neutrals (borders, dividers): #E0DEDC, #EBE9E7
- Amber (needs attention): #F59E0B
- Red (problems, SLA breach, churn risk): #C43E3E

Cards: white background, 1px border #E0DEDC, border-radius 12px,
shadow: 0px 2px 4px rgba(0,0,0,0.08)

---

## Data sources

**Support tickets**
Pylon API → tickets for PLG accounts
Filter: account.hubspot.type = "Customer - PLG"
States: waiting_on_customer / new / waiting_on_you / closed

**Account data**
HubSpot → PLG account list (type = "Customer - PLG")

**Product usage**
PostHog → sessions, feature usage, errors per account
Use to flag: zero activity this week, error spikes, friction points

**Call context**
Fireflies API → recent call transcripts for PLG accounts
Surface: last call date, topics discussed, open action items

**Email context**
Gmail → recent threads with PLG customers
Surface: last contact date, unanswered emails, accounts going quiet

---

## External API rules — READ ONLY

**Never write to, update, or delete data in these services:**

- **Pylon** — read only. Never create, update, or delete tickets, contacts, accounts, or any other records.
- **HubSpot** — read only. Never create, update, or delete contacts, companies, deals, tickets, or any other CRM records.
- **PostHog** — read only. Never create events, update persons, modify feature flags, or write any data.
- **Fireflies** — read only. Never create soundbites, update transcripts, change privacy settings, or write any data.

If a task appears to require writing to one of these services, stop and ask Charlie before proceeding.

---

## Handling untracked data

Never hide a section because data isn't available. Show a placeholder card:
- Same card style as live sections
- Section title + description of what it will show
- "Coming soon" badge in warm grey (#A19F9E)

---

## Charts (ECharts)

All charts must:
- Use brand colour tokens only — no random colours
- Have tooltips styled to match the card design
- Animate on load
- Be responsive (resize with window)

Chart types in use:
- Sparklines in pulse cards (line)
- Ticket volume by week (line)
- Status breakdown (donut — amber / blue / grey)
- FRT by account (horizontal bar, red if > 60 min SLA)
- Issue themes frequency (bar, week on week)
- Session volume (line)
- Active users per account (bar)

---

## Copy rules

Run /review-copy before committing any text. Specifically:
- Labels: short and direct — "Open tickets" not "Current open ticket volume"
- Empty states: say what will appear, not "No data found"
- No "seamless", "robust", "comprehensive", "leverage", "holistic"
- No reframe patterns ("It's not X, it's Y")
- Contractions are fine

---

## Git rules

- **Never push directly to main — no exceptions**
- One branch per feature: feat/pulse-row, feat/customer-page, etc.
- Every branch gets a Cloudflare preview URL — share it before merging
- Commit after every meaningful chunk of work
- Commit message format: "feat: [what changed]" or "fix: [what was wrong]"
- Merge to main only when Charlie says "ship it"
- After completing work on a branch, always end with: "Ready to merge — say **ship it** when you want this live."
- Do not push to main mid-session just because changes are ready

---

## Environment variables (.env — never commit)

```
PYLON_API_KEY=
HUBSPOT_API_KEY=
POSTHOG_API_KEY=
POSTHOG_PROJECT_ID=
FIREFLIES_API_KEY=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

---

## Task lists

- Only create a task list if the work genuinely needs tracking across multiple steps
- Mark tasks complete as each one finishes — never leave them open after the work is done
- Once all tasks are complete, remove the task list entirely — don't leave it showing "0 done, 5 open"
- If a task list is getting in the way or no longer relevant, delete it immediately

---

## How to work with Charlie

- One step at a time — pause for confirmation before moving on
- Before any terminal command, explain in plain English what it does
- After each section: show how to preview locally before committing
- When Charlie says "looks good" → commit and push to preview branch
- Before saying the preview is ready, get the real Cloudflare preview URL and open it:
  ```
  PREVIEW=$(gh api repos/cmostyn/stack-plg/commits/$(git rev-parse HEAD)/check-runs \
    --jq '.check_runs[] | select(.name=="Cloudflare Pages") | .output.summary' \
    | grep -o "https://[a-z0-9-]*\.stack-plg\.pages\.dev" | tail -1) \
    && open "$PREVIEW"
  ```
  Wait for the check to complete if it hasn't yet (status will be `in_progress`). Do not guess the URL — always fetch it from the check run output.
- When Charlie says "ship it" → merge to main
- If something breaks → explain what went wrong before fixing it
- Always communicate in plain, non-technical language — Charlie is not a developer. No jargon, no code terms in explanations, no assuming technical knowledge. If you need to describe something technical, use an analogy or everyday language instead.
