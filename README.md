# NOTaJury

**An AI jury simulation.** Twelve independent LLM-backed agents, each with a
different personality, read the same trial material, form their own positions,
and then argue with each other. The headline gauge is the aggregate of those
twelve positions — and, as the name insists, it is *not a jury*.

> ⚠️ **This is a simulation, not a determination of guilt or innocence.**
> The agents are fictional, the reasoning is synthetic, and the output has no
> legal meaning whatsoever. It models *deliberation dynamics* — how a group's
> views drift as material is introduced — and nothing more. Do not use it to
> assess anyone's actual culpability.

---

## Quick start

```bash
npm run install:all     # installs root + server + client
cp .env.example .env    # then add your GROQ_API_KEY
npm run dev             # runs API and web app together
```

- Landing page → http://localhost:5273/
- Simulator → http://localhost:5273/app
- White paper → http://localhost:5273/paper
- API → http://localhost:4100

The simulator is a **single non-scrolling screen**: the courtroom and the gauge are
always visible, and everything else — timeline, trend chart, change attribution,
evidence entry — opens on demand from the dock along the bottom. Clicking a juror
opens their dossier in a side drawer. Escape closes whatever is open.

Postgres is expected at the `DATABASE_URL` in `.env`. The schema is created
automatically on boot, and a fictional demo case is seeded on first run.

If `GROQ_API_KEY` is missing the app still runs — it falls back to a built-in
deterministic heuristic agent so you can demo the UI offline.

---

## How the simulation works

Each round is one trial event, processed in three phases.

**1 · Independent evaluation.** Every juror gets its own LLM call, with its
personality traits written into the system prompt. Agents run concurrently
(`AI_CONCURRENCY`). A failure on one juror falls back to the heuristic for that
juror only — one bad API call never takes down a deliberation.

**2 · Evidence intake.** Each agent's conclusion is blended into its existing
position at a rate set by its traits and by the character of the evidence:

| Trait | Effect |
|---|---|
| `analytical` | raises openness to evidence; damps response to emotional material |
| `skepticism` | lowers openness across the board; discounts peers it disagrees with |
| `empathy`, `emotionality` | raise responsiveness to emotionally charged material |
| `authorityTrust` | raises the weight of expert/official/police sources |
| `independence` | resists peer pressure; raises willingness to hold a minority view |
| `suggestibility` | raises how far a confident peer can move them |

Traits also apply a persistent **disposition bias** (`dispositionBias()`), a
standing personal tilt of roughly ±0.25. This is what keeps the twelve agents
genuinely apart — without it, traits only change *how fast* each juror reaches
the same conclusion and all twelve converge on one number, leaving deliberation
nothing to do.

**3 · Deliberation.** Jurors pull on each other over `DELIBERATION_PASSES`
rounds. For each juror, peers are weighted by their persuasiveness and
confidence, discounted by disagreement; movement is scaled by the juror's
susceptibility. Every shift is attributed back to the peers that caused it,
which is what populates the influence arcs and the "who persuaded whom" list.

Confidence is re-anchored each round to the agent's own reading of the evidence,
then adjusted by a bounded ±0.15 for how the room received it — so agreement
firms people up without confidence ratcheting to 1.0 and sticking there.

**Positions** are tracked as a continuous `lean` from −1 (not guilty) to +1
(guilty); the Guilty / Not guilty / Uncertain blocs are the ±0.2 bands of it.

---

## Feeding it your own case

Everything is driven through the API — the UI is just a client.

```bash
# create a case
curl -X POST localhost:4100/api/cases -H 'Content-Type: application/json' -d '{
  "title": "The State v. Example",
  "summary": "Background the jurors are given up front.",
  "defendant": "A. Example",
  "charge": "Burglary"
}'

# feed a trial event — this triggers a full simulation round
curl -X POST localhost:4100/api/cases/$CASE_ID/events -H 'Content-Type: application/json' -d '{
  "kind": "evidence",
  "side": "prosecution",
  "title": "CCTV places the defendant at the scene",
  "content": "Full text presented to the jury…",
  "strength": 0.7,
  "emotional": 0.2,
  "authority": 0.8
}'
```

| Field | Meaning |
|---|---|
| `kind` | `evidence`, `testimony`, `argument`, `instruction`, `objection`, `cross_examination` |
| `side` | `prosecution`, `defence`, `neutral` |
| `strength` | probative force, 0–1 |
| `emotional` | how emotionally charged, 0–1 |
| `authority` | how much it rests on an expert/official source, 0–1 |
| `transcriptText` | raw court-reporting text — parsed into speaker lines (see below) |
| `transcript` | pre-structured `[{speaker, role, text}]`, if you'd rather parse it yourself |

### Transcripts

Court reporting arrives as dialogue, so paste it as dialogue. Send the block as
`transcriptText` (or use the **Paste transcript** tab in the app) and the server
splits it into turns:

```
Cini returns to a chat involving Fenech and Schembri.

Fenech: Lost my phone, my friend.
Schembri: Delete WhatsApp.
Cini: Had you deleted WhatsApp?
Fenech: I do not remember.
```

Lines shaped `Speaker: words` become dialogue; anything else is kept as the
reporter's aside and rendered in italics. The exchange is passed verbatim to every
agent, which is asked to weigh the manner of the answers — hesitation, evasion, a
concession under pressure — not just their content.

The parser does **not** guess a speaker's role from their name. Labelling a named
individual "the prosecution" is a factual claim the software has no basis for, so
roles stay neutral unless the speaker label itself says otherwise (`Judge:`,
`Prosecutor:`), and speakers are coloured by order of appearance.

### Real proceedings

`POST /api/cases` accepts `realCase: true` and a `sourceNote`. Setting it changes
the masthead badge to a hard warning and adds a paragraph to the in-app notice
explaining that simulated leanings about a named defendant are not findings about
them. Set it whenever the material comes from a real case — the whole point is
that a screenshot of a "72% guilty" gauge should never be able to travel without
that context attached.

---

## Back office

Controls live in a portal, not in the public simulator. `/app` is a read-only
view: courtroom, gauge, and the timeline / trend / attribution panels.

```
/login    passphrase gate — PORTAL_PASSWORD in .env (default: notajury)
/portal   trials · jurors · evidence · sources
```

**Nothing links to `/login`.** It is reachable only by typing the route.

> The gate is a convenience, not a security boundary. It compares one shared
> passphrase and hands back a deterministic token. Do not expose it publicly
> without putting real authentication in front of it.

| Tab | What it does |
|---|---|
| **Trials** | create, edit, reset or delete a case; flag it as a real proceeding; attach unlinked scraped sources |
| **Jurors** | inspect all twelve, edit any trait live, re-apply the roster names, reset personalities |
| **Evidence** | put evidence to the jury (transcript / prose / preset), run a deliberation round, promote scraped entries one at a time, review every round's outcome |
| **Sources** | scraped articles, their entry counts and errors |

### Jurors are per case

Jurors are written into the database when a case is created, so changing the
roster in `personalities.ts` does not touch existing trials. **Jurors → Re-apply
roster names** pushes the current roster onto a case by seat; "Reset traits"
also restores default personalities.

The roster is Maltese, and the surnames deliberately avoid every party, counsel
and witness appearing in the proceedings this tool has been pointed at — a
synthetic juror must never share a name with a real participant.

### Icons

Icons are monochrome line art (`components/Icon.tsx`) drawn in `currentColor`.
Hue in this interface is reserved for data — a juror's leaning — and is never
spent on decoration.

---

## Scraping trial coverage

A one-shot service that pulls live-blog trial reporting into the database.

```bash
# put your URLs in urls.txt (newline, comma or semicolon separated; # for comments)
npm run scrape --prefix server

npm run scrape --prefix server -- urls.txt --case <caseId>   # attach to a case
npm run scrape --prefix server -- --force                    # re-fetch stored URLs
npm run scrape --prefix server -- --html-only                # skip the paged feed
npm run scrape --prefix server -- --delay 2000               # politeness delay (ms)
```

**Already-scraped URLs are skipped.** Each URL is stored in `sources` with a
`status`; a URL that came back `ok` is left alone on the next run unless you pass
`--force`. Entries are keyed on `(source_id, external_id)`, so re-running a live
blog that has since grown adds only the new posts and never duplicates.

### How it gets the whole blog

The article HTML only server-renders the **ten** most recent posts. The rest sit
behind a `#lc-load-more` button, which pages a Live Center JSON feed:

```
GET https://livecentercdn.norkon.net/BulletinFeed/{tenant}/{channelId}/EarlierObj/{oldestId}/
→ { result: { bulletins: [ …20 ], hasMore: bool } }
```

The tenant and channel id are embedded in the page as
`setJsonContent('timesofmalta', 90611)`. The scraper reads those, takes the oldest
id from the rendered posts, and walks the feed backwards until `hasMore` is false
— so it gets the complete day with **no headless browser**. On the sample URL that
is 10 rendered posts plus 42 from the feed: 52 total, matching what the button
yields after three clicks.

Extraction targets `#master-container` (it's an `id`, not a class — a class of the
same name is accepted too), then per post: `.ncpost-byline`, `.ncpost-timestamp`,
`.ncpost-title`, `.ncpost-content`.

Posts whose body looks like an exchange (several `Speaker: words` lines) are run
through the transcript parser at scrape time and stored structured. On the sample
day, 13 of 52 entries qualified.

### Scraping populates, it does not simulate

Scraped rows land in `sources` and `source_entries` only. **No trial event is
created and no model is called** — a 52-post day would otherwise be 52 rounds ×
12 agents. Promote the entries you actually want:

```bash
curl -X POST localhost:4100/api/cases/$CASE_ID/events/from-entry/$ENTRY_ID \
  -H 'Content-Type: application/json' \
  -d '{"side":"prosecution","strength":0.7}'
```

That builds a trial event from the entry (carrying its parsed transcript), runs a
full round, and marks the entry `promoted_event_id`.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | status, DB connectivity, active AI provider |
| `GET` | `/api/cases` | list cases |
| `POST` | `/api/cases` | create a case + its 12 jurors |
| `GET` | `/api/cases/:id` | full state (jurors, positions, snapshots, influences, attribution) |
| `POST` | `/api/cases/:id/events` | **feed a trial event and run a round** |
| `POST` | `/api/cases/:id/deliberate` | run a round with no new evidence |
| `POST` | `/api/cases/:id/reset` | clear the trial, keep the jury |
| `POST` | `/api/cases/:id/events/from-entry/:entryId` | promote a scraped entry into a trial event |
| `GET` | `/api/sources` | scraped articles (`?caseId=` to filter) |
| `GET` | `/api/sources/:id/entries` | the live-blog posts from one article |
| `GET` | `/api/suggested-events` | preset events the UI offers |
| `POST` | `/api/portal/session` | exchange the passphrase for a portal token |
| `*` | `/api/portal/*` | back-office operations (requires `x-portal-key`) |

You can also insert straight into Postgres — the tables (`cases`, `jurors`,
`events`, `juror_positions`, `jury_snapshots`, `influences`, plus `sources` and
`source_entries` for scraped material) are plain and readable, and the API reads
the same rows. See `server/src/store/schema.sql`.

---

## Swapping the LLM

The entire AI surface is one interface in `server/src/ai/provider.ts`:

```ts
export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  evaluate(input: JurorEvaluationInput): Promise<JurorEvaluationOutput>;
}
```

To add a provider: implement it, register it in the `registry` map in
`server/src/ai/index.ts`, and set `AI_PROVIDER`. Nothing in the simulation
engine changes.

Because Groq's endpoint is OpenAI-compatible, any OpenAI-shaped API works
already by overriding `AI_BASE_URL` — no new code needed.

### Config

| Var | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | `groq` | `groq` \| `heuristic` |
| `GROQ_API_KEY` | — | falls back to `heuristic` when unset |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | |
| `AI_BASE_URL` | Groq's URL | point at any OpenAI-compatible endpoint |
| `AI_CONCURRENCY` | `6` | parallel juror calls |
| `AI_MAX_TOKENS` | `900` | raise if JSON responses get truncated |
| `AI_TIMEOUT_MS` | `30000` | |
| `DELIBERATION_PASSES` | `2` | peer-influence passes per round |
| `SEED_DEMO` | `true` | seed the fictional demo case on first boot |
| `PORT` | `4100` | |

---

## Layout

```
server/src/
  ai/          provider interface, Groq adapter, heuristic fallback, registry
  sim/         personalities (12 archetypes + trait maths), engine, transcript parser
  services/
    scraper/   extract.ts (HTML) · feed.ts (paged JSON) · index.ts · cli.ts
  store/       schema.sql + Postgres access
  routes/      REST API
client/src/
  pages/       Landing (/), Simulator (/app), WhitePaper (/paper),
               Login (/login), Portal (/portal)
  components/  Courtroom, JuryGauge, LeanChart, Timeline, WhyChanged,
               JurorPanel, TranscriptView, Overlays, Icon (monochrome set)
  theme.ts     state palette (validated for contrast + colour-vision separation)
```

The three state colours are categorical slots from a validated palette and clear
lightness-band, chroma, colour-vision-separation and 3:1 contrast checks against
the app's dark surface. If you change them, re-validate rather than picking by
eye.
