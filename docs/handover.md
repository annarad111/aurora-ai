# Aurora: document de handover tehnic

> Scris pe 19 nov 2026, pe baza codului din `main` (commit `de310ac`). Tot ce e marcat
> `[DE COMPLETAT MANUAL]` nu se poate deduce din cod și trebuie completat de proprietarul proiectului.

## 0. Pe scurt

| | |
|---|---|
| **Nume** | Aurora |
| **Ce face** | Asistent AI pentru revenue managerii de hotel. Utilizatorul pune o întrebare („De ce suntem sub target luna asta?”). Aurora alege uneltele de analiză potrivite, calculează cifrele determinist din baza de date și scrie un răspuns în flux (SSE), cu KPI-uri, grafice, proveniența fiecărei cifre și pași următori. Aplicația mai are un Morning Briefing, o pagină Property Overview (camere, evenimente, financiar), un spațiu Decisions (insight-uri salvate → acțiuni → rezultat) și un simulator what-if. Aceleași 10 unelte sunt expuse agenților externi prin MCP. |
| **Stadiu** | MVP funcțional, publicat pe Cloudflare: https://aurora.radulescuana111.workers.dev. Rulează pe **date demo deterministe** (un singur hotel, `sablon-bru`, 111 camere, „azi” fixat la 17 nov 2026). Nu e conectat la un PMS real. |
| **Utilizatori** | B2B: revenue manageri de hotel (UI) și agenți AI externi (MCP). Proiectul e un concept independent pentru „Juyo assessment” (vezi `package.json`). `[DE COMPLETAT MANUAL]`: utilizatorii reali vizați după demo, dacă există. |

Documente complementare, deja în repo:
- [README.md](../README.md): comenzi și lista rutelor
- [architecture.md](architecture.md): deciziile de arhitectură, mai pe larg
- [mcp-usage.md](mcp-usage.md): cum se conectează un client MCP
- [design-system.md](design-system.md): tokenuri și reguli vizuale
- [ux-rationale-validation.md](ux-rationale-validation.md): justificarea UX

---

## 1. Arhitectura & tech stack

| Strat | Tehnologie |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 6, **Sass** (fără Tailwind, fără UI kit), fără router: o singură pagină cu state local |
| Backend | Un singur **Cloudflare Worker** (TypeScript, `compatibility_date` 2025-09-01, `nodejs_compat`). Rutare manuală în `worker/src/app.ts`, fără framework. |
| Contracte | **Zod 4**, în `packages/shared`: aceleași scheme validează pe server și în browser (inclusiv fiecare eveniment SSE). |
| Bază de date | **Cloudflare D1** (SQLite), binding `DB`, baza `aurora-db` |
| AI | **Workers AI**, binding `AI`, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Doar în mediul `ai`. Modelul alege uneltele și scrie textul, dar **nu scrie nicio cifră** (vezi §5.2). |
| MCP | `agents` (Cloudflare Agents SDK, `createMcpHandler`, stateless, Streamable HTTP) și `@modelcontextprotocol/server` |
| Rate limiting | Binding-uri Cloudflare `ratelimits`: chat 20/min, MCP 60/min, per IP |
| Teste | Vitest 3 în toate pachetele (în jur de 400 de teste). Testele UI folosesc `renderToStaticMarkup`, fără DOM. |
| Hosting | Cloudflare Workers: aceeași origine servește assets statice, API și `/mcp` |
| CI/CD | **Nu există.** Deploy-ul e manual (`npm run deploy`). Nu există director `.github/`. `[DE COMPLETAT MANUAL]` dacă se dorește un pipeline. |

### Fluxul principal de date

```
                ┌──────────────────────── Cloudflare Worker "aurora" ─────────────────────────┐
 Browser ─GET /─▶ ASSETS (web/dist, SPA fallback)                                              │
   React │                                                                                     │
         ├─GET /api/workspace|briefing|property|decisions ─▶ routes/* ─┐                        │
         ├─POST /api/chat ──▶ routes/chat ─▶ orchestrator/run-insight ─┤                        │
         │  ◀── SSE: run_started, step, kpi, chart, insight,           │                        │
         │       text_delta, provenance, followups, done               ├─▶ tools/registry.ts    │
         ├─POST /api/simulate ─────────────────────────────────────────┤   (10 unelte, Zod I/O) │
         │                                                             │        │               │
 Agent ──┴─/mcp (Bearer MCP_TOKEN) ─▶ mcp/aurora-mcp-server ───────────┘        ▼               │
   MCP                                                               packages/analytics (calcul │
                                                                     pur) ◀─ db/D1 repository ─▶ D1
          orchestrator ⇄ Workers AI (doar alegerea uneltelor + textul cu placeholdere; opțional)│
          orchestrator ─▶ D1: salvează răspunsul terminat (conversation_turns)                  │
                └──────────────────────────────────────────────────────────────────────────────┘
```

Principii (aplicate peste tot în cod):
1. **O singură origine, un singur deploy.** Nu există CORS și nici hop intern.
2. **Un singur registru de unelte** (`worker/src/tools/registry.ts`), folosit atât de chat, cât și de MCP.
3. **Cifrele sunt deterministe.** Vin doar din `packages/analytics` (funcții pure) și din reguli fixe. LLM-ul e opțional, iar fără el aplicația merge identic, cu template-uri.

---

## 2. Structura proiectului

Monorepo cu **npm workspaces**:

```
aurora-ai/
├─ wrangler.jsonc            config Worker: assets, D1, rate limits, vars; mediul "ai" adaugă Workers AI
├─ package.json              scripturile de la rădăcină (dev, test, deploy, migrări)
├─ .dev.vars.example         model pentru secretele locale (MCP_TOKEN)
├─ docs/                     arhitectură, MCP, design system, UX, acest handover
├─ packages/
│  ├─ shared/src/            CONTRACTE Zod + tipuri: domain, tools, tool-names, stream-events,
│  │                         investigation, decisions, property, briefing, format (€, %, pp)
│  ├─ analytics/src/         MATEMATICĂ PURĂ: kpi, variance (gap = volum + mix + preț), channels,
│  │                         pace, scenario (what-if), breakdown, status, findings. Fără HTTP/LLM/React.
│  └─ demo-data/src/         SETUL DEMO determinist: story.ts (povestea plantată: congresul anulat
│                            etc.), generate-demo-dataset.ts, property.ts (111 camere, 6 etaje, evenimente)
├─ worker/
│  ├─ migrations/            0001–0010 *.sql (0002, 0004, 0009, 0010 sunt GENERATE, nu se editează de mână)
│  ├─ scripts/               generate-seed-sql.ts, print-tool-outputs.ts, try-mcp.ts
│  ├─ test/                  teste de integrare pe repository-ul in-memory
│  └─ src/
│     ├─ index.ts            entry: construiește dependențele reale (D1, AI, secrete, rate limiters)
│     ├─ app.ts              router-ul (toate rutele într-un loc)
│     ├─ env.ts              binding-uri + citirea/validarea variabilelor, cu valori implicite
│     ├─ routes/             câte un fișier per rută
│     ├─ tools/              cele 10 unelte + registry.ts
│     ├─ orchestrator/       rularea unui răspuns: planificare, unelte, text, gardă, proveniență,
│     │                      răspunsuri scrise prin reguli (decisions/property/what-if/briefing)
│     ├─ db/                 HotelDataRepository (interfață), implementarea D1 (singurul SQL),
│     │                      implementarea in-memory (teste, scripturi)
│     ├─ decisions/          decision-service.ts (insight-uri, acțiuni, rezultate)
│     ├─ llm/                interfața LanguageModel + adaptorul Workers AI (cu timeout)
│     ├─ mcp/                serverul MCP (înregistrează toate uneltele din registry)
│     ├─ sse/                stream SSE validat, numerotat, cu heartbeat, oprit la deconectare
│     └─ http/               răspunsuri JSON, token Bearer (comparație constant-time), rate limit
└─ web/
   ├─ vite.config.ts         proxy /api și /mcp → AURORA_API_ORIGIN (implicit 127.0.0.1:8787)
   └─ src/
      ├─ app/                App.tsx, layout/ (Sidebar, ConversationHeader, EvidencePanel, ThemeSwitch)
      ├─ features/           briefing, conversation, decisions, empty-state, evidence (carduri,
      │                      what-if), explore (overlay-ul simulatorului), insights, investigation, property
      ├─ stream/             parse-sse.ts (fetch + ReadableStream), run-reducer.ts (state-ul unui
      │                      răspuns), useConversation.ts
      ├─ design-system/      ThemeProvider (Light/Dark), icons
      ├─ lib/                formatare date, metrici, timp relativ
      └─ styles/             Sass 7-1: abstracts (tokenuri, mixin-uri de tipografie text-*),
                             base, components, layout, themes; main.scss
```

Dependențele merg strict într-o direcție: `shared` ← `analytics` ← `demo-data` ← `worker`, iar `web` depinde doar de `shared` și `analytics`.

---

## 3. Setup local & variabile de mediu

### Cerințe
- **Node.js 22** (proiectul e rulat cu v22.15.1; nu există `.nvmrc` sau `engines`) și npm.
- Docker, Python etc. **nu** sunt necesare. Wrangler (CLI-ul Cloudflare) e devDependency.
- Doar pentru modul AI: cont Cloudflare și `npx wrangler login`.

### Pornire
```bash
npm install
npm run db:migrate:local          # creează D1 local în .wrangler/ cu schema + datele demo
cp .dev.vars.example .dev.vars    # pune un șir aleator lung în MCP_TOKEN (doar dacă vrei /mcp local)

npm run dev       # Worker :8787 + Vite :5173, fără AI, merge offline → http://localhost:5173
npm run dev:ai    # la fel, cu Workers AI (cere wrangler login; modelul rulează mereu în cloud)
npm test          # Vitest în toate pachetele
npm run typecheck
```

Utile:
- `npm run tools:demo [-- --json]` rulează uneltele pe datele demo.
- `npm run mcp:try` se conectează la `/mcp` ca un client real.
- Worker-ul pe alt port: `AURORA_API_ORIGIN=http://127.0.0.1:8789 npm run dev:web`.

### Variabile de mediu

Secrete (fișierul `.dev.vars` local, `wrangler secret put` în producție):

| Variabilă | Rol | Format exemplu |
|---|---|---|
| `MCP_TOKEN` | Token Bearer pentru `/mcp`. Lipsă → `/mcp` e dezactivat. | `9fK2…` (≥ 24 caractere aleatoare, base64url) |

Variabile publice (`vars` în `wrangler.jsonc`, separat pentru mediul implicit și pentru `ai`):

| Variabilă | Rol | Exemplu / implicit |
|---|---|---|
| `NARRATIVE_PROVIDER` | `scripted` = doar template-uri; `llm` = Workers AI cu fallback pe template-uri | `scripted` (implicit), `llm` (env `ai`) |
| `AI_MODEL` | Modelul Workers AI | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `AI_TIMEOUT_MS` | Timpul maxim pentru un apel la model, apoi preiau template-urile | `15000` |
| `DEMO_TODAY` | „Azi” al hotelului. Datele demo sunt generate în jurul lui. | `2026-11-17` |
| `STREAM_STEP_DELAY_MS` | Pauza între pașii stream-ului (estetic); `0` o dezactivează | `450` |
| `TEXT_TOKEN_DELAY_MS` | Pauza între cuvintele streamate; `0` o dezactivează | `30` |

Variabile de build și dev (shell, nu Worker):

| Variabilă | Rol | Exemplu |
|---|---|---|
| `AURORA_API_ORIGIN` | Ținta proxy-ului Vite pentru `/api` și `/mcp` | `http://127.0.0.1:8787` |

Binding-uri (nu sunt variabile, dar sunt obligatorii): `DB` (D1), `ASSETS`, `AI` (doar `ai`), `CHAT_RATE_LIMITER`, `MCP_RATE_LIMITER`.

Tokenul MCP de producție e păstrat local, în `.secrets/production.env` (ignorat de git), pe mașina care l-a setat. `[DE COMPLETAT MANUAL]`: predarea lui pe un canal sigur (nu prin repo sau chat).

---

## 4. Baza de date & modele de date

D1 (SQLite). Granularitatea este **zilnică, per segment și canal**; nu există rezervări individuale.

| Tabel | Cheie | Conținut |
|---|---|---|
| `hotels` | `id` | nume, oraș, `room_count`, monedă (doar EUR), fus orar |
| `channels` | `code` (direct/ota/gds/wholesale) | `commission_rate` |
| `daily_stats` | (hotel, date, segment, channel) | `rooms_sold`, `room_revenue`, `cancellations` (realizat) |
| `targets` | (hotel, date, segment) | buget zilnic: camere și venit |
| `on_the_books` | (hotel, snapshot_date, stay_date) | rezervări viitoare la o anumită dată (pace) |
| `group_blocks` | `id` | grupuri/MICE: nopți, camere/noapte, `confirmed`/`cancelled` + `cancelled_on` |
| `conversations` | `id` (generat în browser) | titlu, hotel, timestampuri |
| `conversation_turns` | (conversation_id, position), `ON DELETE CASCADE` | întrebarea + **evenimentele SSE exacte** (`events_json`), redate fără a rula din nou uneltele |
| `decision_records` | `id` | insight-uri și acțiuni ca **JSON versionat** (`record_version`, `record_json`); `source_key` unic per hotel/tip (salvarea dublă nu creează un al doilea rând), `parent_id` leagă acțiunea de insight |
| `property_profiles` | `hotel_id` | adresă, tip proprietate, `room_types_json`, `is_demo_data` |
| `rooms` | (hotel, room_number) | etaj, tip cameră (101–119 … 601–618 = 111 camere) |
| `room_status_events` | `id` → FK (hotel, room) | `out_of_order` / `out_of_service`, motiv, nopți |

Relații: totul atârnă de `hotels.id`. Conversation 1→N turns. Insight 1→N acțiuni (prin `parent_id`, fără FK). Room 1→N status events.

Câteva lucruri de știut:
- `suggested_questions` și `asked_questions` (din 0003) au fost **șterse în 0005**.
- `decision_records` nu are coloane per câmp: Worker-ul validează fiecare record cu Zod la citire și îl sare pe cel care nu mai corespunde. Schimbarea formatului se face prin `DECISION_RECORD_VERSION`, nu printr-o migrare.

### Migrări și seed

```bash
npm run db:migrate:local     # local (.wrangler/)
npm run db:migrate:remote    # producție (env ai), întotdeauna ÎNAINTE de deploy dacă există migrări noi
npm run db:seed:generate     # rescrie 0002, 0004, 0009, 0010 din packages/demo-data
```

Reguli:
- Migrările deja aplicate **nu se editează**; se adaugă `0011_*.sql`.
- După o schimbare în `packages/demo-data`, rulezi `db:seed:generate`. Atenție: dacă seed-ul unei migrări deja aplicate se schimbă, producția **nu** îl reaplică, deci schimbarea trebuie pusă într-o migrare nouă (așa s-a procedat cu 0010).
- Testele `packages/demo-data/test/data-validity.test.ts` și `property-data.test.ts` verifică plauzibilitatea datelor (ocupare ≤ 100%, buget ≤ capacitate, numere de camere valide etc.).

---

## 5. Fluxuri critice & logica de business

### 5.1 Un răspuns în chat (`POST /api/chat`)
1. `routes/chat.ts` aplică rate limit-ul (20/min/IP), validează `{ question, hotelId, conversationId, investigation? }` și deschide un stream SSE (`sse/sse-event-stream.ts`): evenimente validate Zod, cu `runId` și `sequence` crescător, heartbeat; dacă clientul se deconectează, rularea se oprește.
2. **Planificarea** (`orchestrator/insight-planners.ts`, `insight-plan.ts`). Ordinea regulilor este: salut/social → what-if → decisions → property → follow-up → off-topic → cuvinte-cheie.
   - Cu LLM: modelul primește uneltele prin function calling, iar alegerea lui e convertită într-un plan. Uneltele obligatorii se adaugă oricum, iar ordinea de rulare e fixă.
   - Fără LLM sau dacă modelul eșuează: reguli de cuvinte-cheie.
   - Un `investigation` (context de investigație) (venit din briefing, un grafic, un card KPI sau pagina de proprietate) fixează intenția, perioada, segmentul etc.
3. `run-insight.ts` rulează uneltele, iar după fiecare emite `step`, `kpi` și `chart` (`tool-events.ts`). Apoi vin `insight` (titlul), `text_delta`, `provenance` (pentru fiecare `factId`), `followups` și `done`.
4. Planurile scrise prin reguli (decisions, property, impactul mentenanței, what-if, morning briefing) trec prin helper-ul `emitWrittenAnswer`, fără LLM.
5. Răspunsul terminat se salvează în `conversation_turns` (prin `waitUntil`). Primul răspuns analitic dă titlul conversației, dacă userul nu l-a redenumit (`title_is_custom`).
6. Clientul: `web/src/stream/parse-sse.ts` citește stream-ul (fetch + ReadableStream, ca să poată face POST și abort), iar `run-reducer.ts` construiește state-ul afișat.

### 5.2 Garda cifrelor (de ce LLM-ul nu poate inventa numere)
1. `figure-catalogue.ts` dă modelului doar placeholdere cu sens, de exemplu `{revenue_gap} = "€33,917" (cât e venitul SUB target)`.
2. Modelul scrie un text de felul „Revenue is {revenue_gap} below target…”.
3. `narrative-guard.ts` respinge textul dacă găsește o cifră în afara unui placeholder, un placeholder necunoscut, mai puțin de 3 cifre sau o lungime greșită. Modelul are un singur retry, cu motivele respingerii.
4. La eșec, timeout (15 s) sau a doua respingere, preia `scripted-narrative-writer.ts`, iar footer-ul spune „Scripted narrative (model unavailable)”.
5. Regulile de stil pentru model sunt în `prompts.ts`. Regula 10, de exemplu, interzice legarea congresului anulat de pace-ul viitor.

### 5.3 Morning briefing → investigație → decizie
1. `GET /api/briefing` (`orchestrator/morning-briefing.ts`) produce cel mult 3 itemi, ordonați după reguli fixe (prioritate, abatere față de bază, sursă). Fiecare item are contextul investigației pe care o deschide.
2. Click pe un item, un punct de grafic sau un card KPI deschide `InvestigationPanel`. Panoul are acțiuni (`investigation-actions.ts`) care trimit în chat o întrebare plus un context structurat (`investigation`).
3. Orice insight se poate salva (`SaveInsightButton`, `POST /api/decisions/insights`). Pe el se creează acțiuni cu prioritate și termen, iar o acțiune încheiată primește un rezultat (`decision-service.ts`).
4. Chat-ul răspunde și despre decizii („ce decizii am salvate?”, „ce e întârziat?”) prin unealta `get_decisions`.

### 5.4 Property Overview și răspunsurile despre camere
`GET /api/property` (`routes/property.ts`) întoarce:
- camerele în seara asta: ocupate, libere, out of order, out of service
- evenimentele (mentenanță, grup sosit, grup anulat), cu impactul măsurat
- luna completă anterioară, față de target și anul trecut

Chat-ul răspunde la „câte camere sunt libere?” prin `get_property_status` și `get_room_events` (`property-answer.ts`). Răspunsul include o acțiune `navigate` care deschide secțiunea exactă a paginii (`destination: 'property'`, `section: 'inventory' | 'events' | …`).

### 5.5 What-if
`POST /api/simulate` și unealta `simulate_scenario` (`packages/analytics/src/scenario.ts`) primesc `paceRecovery`, `rateChange` și `otaToDirect` pe o perioadă de ședere și calculează efectul în euro.
- În UI simulatorul e în `ExploreOverlay`: se deschide din cardul de pace („Expand · What-if”), are un callout și un pop-up afișat o singură dată (`localStorage` `aurora.hint.what-if-seen`).
- În chat, întrebările „What if…” trec prin `what-if-answer.ts`.

**Autentificare/autorizare:** nu există pentru UI și `/api/*` (vezi §8). Doar `/mcp` are token.

---

## 6. API endpoints / integrări externe

Toate sunt pe aceeași origine. Erorile au forma `{ error: { code, message } }` (`http/json-response.ts`).

| Metodă | Endpoint | Rol | Payload / parametri |
|---|---|---|---|
| GET | `/api/health` | starea Worker-ului și a DB | — |
| GET | `/api/workspace?hotel=` | hoteluri, perioadă, întrebări de start scrise din date, `today` | — |
| GET | `/api/briefing?hotel=` | morning briefing (≤ 3 itemi) | — |
| GET | `/api/property?hotel=` | Property Overview | — |
| POST | `/api/chat` | răspuns în stream SSE | `{ question, hotelId, conversationId, investigation? }` |
| GET | `/api/conversations?hotel=` | lista Recent | — |
| GET | `/api/conversations/:id` | conversația cu evenimentele salvate | — |
| PATCH | `/api/conversations/:id?hotel=` | redenumire | `{ title }` |
| DELETE | `/api/conversations/:id?hotel=` | ștergere (cu turn-urile) | — |
| GET | `/api/decisions?hotel=` | insight-uri, acțiuni, rezultate | — |
| POST | `/api/decisions/insights` | salvare insight (idempotent pe `source_key`) | insight Zod (`packages/shared/src/decisions.ts`) |
| DELETE | `/api/decisions/insights/:id?hotel=` | ștergere, doar dacă insight-ul nu are acțiuni | — |
| POST | `/api/decisions/actions` | creare acțiune | acțiune Zod |
| PATCH / DELETE | `/api/decisions/actions/:id?hotel=` | modificare / ștergere | câmpurile modificate |
| POST | `/api/simulate` | what-if | `{ hotelId, stayFrom, stayTo, paceRecovery?, rateChange?, otaToDirect? }` |
| GET | `/api/hotels/:id/overview?from=&to=` | unealta overview ca JSON simplu | — |
| POST/GET | `/mcp` | server MCP (Streamable HTTP), cele 10 unelte | `Authorization: Bearer <MCP_TOKEN>`, 60/min |

Contractele exacte (sursa de adevăr) sunt schemele Zod din `packages/shared/src/`, iar uneltele sunt în `tools/registry.ts`. Cele 10 unelte sunt:
- `get_hotel_overview`, `query_performance`, `analyze_revenue_drivers`
- `get_channel_mix`, `get_booking_pace`, `get_group_blocks`
- `simulate_scenario`, `get_decisions`, `get_property_status`, `get_room_events`

**Integrări externe:** doar Cloudflare (D1, Workers AI, Rate Limiting). Nu există PMS, channel manager, email sau plăți. `[DE COMPLETAT MANUAL]`: sursa de date reală (PMS/RMS) dacă proiectul trece de demo.

---

## 7. Deployment & mentenanță

- **Medii.** Există un singur mediu deploy-at: env `ai`, Worker `aurora` (https://aurora.radulescuana111.workers.dev). Mediul implicit (fără AI) e doar pentru dezvoltare locală. **Nu există staging**: `[DE COMPLETAT MANUAL]` dacă e nevoie de unul (un env nou în `wrangler.jsonc`, cu o bază D1 separată).
- **Branch-uri.** Se lucrează direct pe `main`: fiecare pas e testat, commit-uit și push-uit pe GitHub, apoi deploy-at. Nu există protecție de branch sau PR-uri obligatorii.
- **Release:**
  ```bash
  npm test && npm run typecheck
  npm run db:migrate:remote      # doar dacă au apărut migrări noi
  npm run deploy                 # build web (tsc + vite) + wrangler deploy --env ai
  ```
- **Setup unic** (deja făcut): `wrangler login`, `wrangler d1 create aurora-db` (id-ul se pune în `wrangler.jsonc` în **ambele** locuri), `wrangler secret put MCP_TOKEN --env ai`. Contul Cloudflare aparține proprietarului; `[DE COMPLETAT MANUAL]`: transferul sau invitarea noului developer în cont.
- **Rotirea tokenului MCP:** valoarea nouă se pune în `.secrets/production.env`, apoi rulezi `npx wrangler secret put MCP_TOKEN --env ai`.
- **Log-uri:**
  - `npx wrangler tail --env ai` arată log-urile live (erorile 500 apar ca `[Aurora] request failed`).
  - Mai sunt Cloudflare Dashboard → Workers → aurora → Logs/Metrics, și D1 → aurora-db → Console pentru interogări SQL.
  - Observability persistentă (`observability` în wrangler) **nu** e activată.
- **Debugging în producție:**
  - `GET /api/health` arată starea Worker-ului și a DB.
  - `npx wrangler d1 execute aurora-db --remote --env ai --command "SELECT …"` rulează interogări direct pe baza de producție.
  - Dacă modelul cade, footer-ul răspunsului spune „Scripted narrative (model unavailable)”.
- **Rollback:** `npx wrangler rollback --env ai` (versiunea anterioară a Worker-ului). Migrările D1 nu au rollback automat.

---

## 8. Known issues, tech debt & next steps

### Limitări cunoscute (asumate pentru demo)
- **Fără autentificare și fără multi-tenancy.** Oricine are URL-ul poate citi, crea și șterge conversații și decizii pentru orice `hotel=`. Pentru utilizatori reali e nevoie de auth (ex.: Cloudflare Access sau OAuth) și de verificarea apartenenței la hotel pe fiecare rută.
- **Date demo, un singur hotel.** „Azi” e fixat la 17 nov 2026 (`DEMO_TODAY`), iar header-ul afișează „Demo data · today is 17 Nov 2026”. Sosirile și plecările nu există în date, iar UI-ul spune asta explicit.
- **Nu există pagină Performance.** Butoanele respective deschid chat-ul (decizie de produs: „Not now”).
- **MCP cu token partajat.** Pasul următor e OAuth (vezi `docs/mcp-usage.md`).
- **Rate limit per `cf-connecting-ip`.** Fără header (local) cheia devine `local`, deci toți clienții locali împart aceeași limită.
- **Calitatea LLM-ului.** Llama 3.3 alege uneori unelte greșite sau scrie text respins. Fallback-ul acoperă cazurile, dar textul devine mai „template”.

### Tech debt
- **Documentație rămasă în urmă.** `README.md` și `docs/architecture.md` vorbesc încă în unele locuri de „4 tools”, „six chat tools” și „5 tables”. Corect: 10 unelte și 12 tabele. Lista „Where things are” din README nu include `briefing/`, `decisions/` și `property/`.
- **Configurație duplicată.** `wrangler.jsonc` repetă D1, rate limits și vars pentru env `ai` (Wrangler nu le moștenește). Orice schimbare trebuie făcută în ambele locuri.
- **Fără CI.** Testele și typecheck-ul rulează doar manual. Recomandare: un GitHub Action cu `npm ci && npm run typecheck && npm test`, eventual și deploy la push pe `main`, cu un token Cloudflare ca secret.
- **`dev:api` reconstruiește web-ul la fiecare pornire,** iar Wrangler pierde uneori assets după rebuild (404). Soluția e repornirea; pentru lucru pe UI e mai bun Vite (`dev:web`).
- **Windows.** Procesele `workerd` rămân uneori orfane și țin ocupate porturile 8787/8788. Se închid din Task Manager sau se pornește pe alt port (vezi `AURORA_API_ORIGIN`).
- **Planificatorul pe cuvinte-cheie** (`insight-plan.ts`) a crescut prin reguli adăugate succesiv (social → what-if → decisions → property → …). E un candidat de refactor: reguli declarative, cu teste per regulă.
- **`App.tsx` concentrează mult state** (conversație, panouri, overlay, navigare). Un router minim sau un context per feature ar simplifica.
- **Baza live conține conversații de test** create în timpul dezvoltării. Se pot șterge din UI sau cu `DELETE FROM conversations WHERE …` pe `--remote`.

### Recomandări imediate pentru următorul developer
1. Rulează `npm install`, `npm run db:migrate:local`, `npm test` și `npm run dev`. Apoi parcurge întrebările de start din UI cu `docs/architecture.md` deschis.
2. Citește în ordinea asta: `packages/shared/src/tools.ts`, `worker/src/tools/registry.ts`, `worker/src/orchestrator/run-insight.ts`, `web/src/stream/run-reducer.ts`.
3. Adaugă CI și actualizează README-ul și architecture.md (§ Tech debt).
4. Înainte de orice utilizator real: autentificare și autorizare per hotel, un mediu de staging cu D1 separat, observability activată.
5. Convenții de păstrat: cod și nume în engleză, descriptive; Sass, nu Tailwind; nicio cifră scrisă de LLM; fiecare contract nou în `packages/shared` cu Zod; teste pentru fiecare unealtă și regulă nouă.
