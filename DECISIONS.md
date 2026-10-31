# Technical decisions

Choices made where the specification left room, with their reasons.

## Stack

**Node.js + TypeScript, as recommended.** Sharing Zod schemas between Core, the backoffice and
Display removes a whole class of contract drift. No alternative is clearly better here.

**Fastify** over Hono: mature plugins for cookies, rate limiting, helmet, static files and
WebSocket, all of which Core needs.

**npm workspaces**: no extra tool to install on the target machines.

**`better-sqlite3` + Drizzle.** Synchronous driver, simple and fast for one process. Repository
interfaces are nevertheless asynchronous, so a PostgreSQL implementation can replace them without
touching the application layer.

**`@node-rs/argon2`**: prebuilt binaries, no compiler needed on a Proxmox LXC.

## Architecture

**DDD in both apps, but the backoffice is thin.** Core follows `domain / application /
infrastructure / presentation`. The backoffice holds no business rule, so entities come from
`@ayko/contracts`, each domain has a typed HTTP client (`infrastructure/api.ts`) and `application/`
only contains real orchestration (the playground stream). Wrapping about a hundred one-line calls
in use-case classes and repository interfaces would add code with no behaviour.

**Backoffice served by Core**, two images (`core`, `display`) instead of three. The specification allows it, and a second
web server would only cost memory on modest hardware. The Docker image still builds it separately.

**Mock mode uses real protocols.** The fake Ollama is an HTTP server speaking the Ollama API; the
fake MCP server runs over real stdio. So mock mode and the tests exercise the production providers,
not test doubles.

**`device.command` added to the WebSocket contract.** The spec's remote actions (reload, clear
cache, go home) need a server-to-tablet frame the spec's table does not list.

**`/ws/admin` pushes invalidation topics**, not data. The backoffice refetches through REST, so
there is one source of truth and a dropped message cannot leave a screen wrong for long.

## Agent

**Tool calling on models without native support: structured prompt.** The catalogue goes in the
system prompt and the model answers with `{"tool": …, "arguments": …}`. Output that may be such a
call is held back so JSON never reaches the screen. The backoffice flags each model.

**Context: truncation, not summary.** A summary means one more inference on a CPU, on every long
conversation, for a small gain on short home requests. Recent messages are kept up to 75 % of
`num_ctx`, using a 3.5 characters per token estimate; the rest is reserved for the answer.

**A claimed action is checked, not trusted.** Real models read a device, then write "c'est fait"
without calling the tool that acts. When the request is an action and no acting tool has run, the
text stays off screen and the model is reminded once; after that Ayko says plainly that nothing was
done. This costs streaming on the turns before the action, which is the price of never showing a
false success. Reads alone also never teach an action shortcut.

**The model receives the list of devices.** Guessing names was the main cause of failures. Any
read-only tool flagged as a context source feeds the prompt; Home Assistant's `GetLiveContext` is
picked up by name. Read for 20 seconds at most, and again after an action. The room comes first, so
the budget cuts the rest of the house.

**Tool results stay in history** for the last three requests, as real call and result messages.
Otherwise the model loses each turn what it just found, like the true name of a device.

**A tablet session belongs to the room**, resumed within 30 minutes even after a reconnection.

**Memories are explicit, not extracted.** "Souviens-toi que…" and "oublie que…" are handled by code,
so nothing depends on a model that invents. The only automatic learning is a nickname, after an
action that really succeeded. Up to `memoryMaxItems` memories everything is sent; beyond that,
pinned ones plus those sharing keywords with the sentence, with embeddings as a bonus when
available. Everything is visible and editable in the backoffice.

**One gate for every tool execution.** LLM calls and cache replays go through
`AgentService.executeTool`, where the policy is resolved again. A model cannot reach a forbidden
tool by inventing its name, and a replay cannot skip a confirmation.

**The tool safety clause is appended by code**, after the persona text, so editing a persona cannot
remove it.

**Timeouts.** The Ollama connection timeout only covers connection: a CPU model may stream for
minutes. The total request timeout covers the rest.

**Host load comes from node_exporter**, because the Ollama API exposes neither CPU nor system
memory. By default Core reads port 9100 of the Ollama address every 5 seconds; a missing exporter
only hides the gauges. Saturation is judged on memory alone: a CPU model at 100 % CPU is working
normally. In a Proxmox LXC, CPU and load may partly reflect the host.

**Failover before the first chunk only.** A started stream cannot be resumed elsewhere.

**No automatic MCP reconnection**, unlike what the specification asks. Home Assistant banned the
IP after three refused tokens in a few seconds. Core makes one attempt, then the backoffice offers
a Reconnect button.

**Closing the playground cancels the request**: a CPU model should not work for nobody.

## Shortcut cache

**Entries exist from the first success; the top N is what occurrences promote.** The specification
says an entry is created after a validated run, and that only the most frequent are loaded in RAM.
So entries are served from the database at once, and the RAM index holds pinned entries plus the N
most frequent above the threshold.

**A read tool's answer is the tool's text**, since the LLM is skipped and a stored sentence would
be stale. Read tools are detected through `readOnlyHint`, else by name (`get_`, `list_`…).

**Web search is never cached**, detected by tool name.

**A declined confirmation is not a replay failure.** It says nothing about the entry's health.

**A doubtful entry keeps its failure count** when the LLM succeeds on the fallback, otherwise it
would never reach the invalidation limit. An invalidated entry can be learned again by a later
successful LLM run, with fresh calls.

**Promoting from history pins the entry**: that is what makes the one-click action take effect
regardless of the frequency threshold.

**Cursor pagination, except history sorted by occurrences**, which uses an opaque offset cursor:
occurrence counts change between requests, so there is no stable key to page on.

## Display

**No shadcn/ui and no TanStack Query in Display.** It is a kiosk with its own full-screen visual
language and a single data stream; it would use neither. Spec section 3 recommends them for both
apps; the backoffice keeps them.

**The Display server has no dependency** and proxies an allowlist of tablet routes. The admin API
cannot be reached through it, and it uses about 66 MB of memory.

**Rich blocks travel in the MCP `structuredContent.blocks` field.** It is a standard field, so a
server without the convention keeps working in plain text. Blocks are shown as they arrive, next to
the model's answer.

**Widgets run a read-only tool chosen per room**, in `auto` policy only, cached 60 seconds: the home
screen runs unattended, so it can never reach a tool that changes something.

**Answers render as Markdown through `react-markdown`**, which ignores raw HTML. Images are dropped
and links stay plain text: model output is untrusted, an image URL would make the tablet call
outside, and a kiosk has no way back from a followed link.

**The conversation of a tablet is lost when it goes home**, which is the idle behaviour the spec
describes. An answer in flight during a disconnection is reported as interrupted, not resumed.

**Steps and confirmations show the tool description**, which the admin can rewrite, because
`lock_door` means nothing to the family.

## Security

**Secrets stay encrypted in exports** when included, so a backup alone reveals nothing and needs
the same master key. They are excluded by default.

**Tablet tokens** are stored hashed. The plaintext waits encrypted for the tablet's first poll,
then is wiped.

**Audit via a hook on every admin mutation**, so a new route cannot forget it. Bodies are left out
because they may carry secrets.

**Restore upserts then removes what the file does not contain**, rather than wiping tables:
deleting a room first would detach its paired tablets.

**No HSTS or `upgrade-insecure-requests`**: the default deployment is plain HTTP on a LAN and those
headers would break it. A reverse proxy can add them.

**Cameras go through Home Assistant's REST API, as MJPEG.** Its MCP server has no camera tool and no
browser reads RTSP, while an `<img>` plays `camera_proxy_stream` with no transcoder and no dependency.
Core proxies it, so the token never reaches a tablet. Sentences are recognised by code rather than
by the model: a view shows at once, even on a busy CPU, and a camera answer never enters the cache.

## Interface

**shadcn/ui**, as specified. Fonts are bundled through Fontsource, because a Google Fonts link
would be an outbound call from a product that promises none.

**Status lights in the sidebar** are the console's identity: they read live component health.

**Model comparison runs sequentially.** Two models in parallel on a CPU would measure contention.
