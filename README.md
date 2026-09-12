# AllAbout Campus

**A campus web agent that finds the answer and shows the evidence.**

AllAbout Campus helps students ask practical course questions—such as assignment deadlines, submission formats, and course policies—while Steel browses the relevant course pages beside the conversation. The answer stays connected to its sources, so students can see what was checked and why the result is trustworthy.

Built for the Battle of Schools Hackathon.

## What it does

- **Course Desk** — ask course questions in a chat workspace and receive a concise answer with citations.
- **Steel Live Browser** — preview the course pages the agent reviewed, with source-page navigation.
- **Research activity** — follow the agent's staged search process and see which pages contributed evidence.
- **History** — reopen prior questions from the current browser.
- **Campus tools setup** — choose Course Desk, timetable alerts, study planning, and notices when entering the app.
- **Timetable & class alerts** — a UI flow for importing a timetable and setting class reminders.
- **Study & assessment plan** — track exercises, midterms, tests, final exams, and assignment milestones.
- **Steel keychain** — a demo password-vault interface for accounts that require sign-in before Steel can search them.
- **30-day sign-in option** — a selectable local demo session that keeps the user signed in for 30 days.

## Product flow

```text
Sign in → choose campus tools → Course Desk
                                 ├─ Ask a course question
                                 ├─ Watch Steel review source pages
                                 ├─ Read cited answer and evidence
                                 ├─ Reopen prior work from History
                                 └─ Manage website accounts with Steel keychain
```

## Tech stack

- React
- TypeScript
- Vite
- CSS
- Lucide icons

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
git clone https://github.com/Team-Chill-2026-9-12-Hackathon-Team/All-About.git
cd All-About/apps/web
pnpm install
pnpm dev
```

Open the local address printed by Vite, usually `http://localhost:5173`.

To create a production build:

```bash
pnpm build
```

## Demo notes

This repository currently presents a polished frontend prototype. Course pages, agent activity, answers, accounts, and sign-in are simulated for the hackathon demo:

- No real external website is accessed.
- No GPT or Steel request is made by this frontend alone.
- The keychain uses example credentials held only in the current demo session.
- The 30-day sign-in preference is stored locally in the browser.

The intended production architecture connects the React interface to a backend orchestration layer, an LLM, and Steel browser sessions, while keeping sensitive credentials on the server-side secure store.

## Team

Team Chill — Battle of Schools Hackathon 2026
