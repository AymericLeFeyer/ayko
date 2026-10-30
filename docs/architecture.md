# Architecture

```
Backoffice (React) ── REST + /ws/admin ──┐
                                         ▼
Display server ────── /ws/display ──► Ayko Core ──► Ollama (HTTP)
                                         │
                                         └────────► MCP servers (stdio, SSE, HTTP)
```

## Repository

| Path                 | Content                                       |
| -------------------- | --------------------------------------------- |
| `packages/contracts` | Zod schemas shared by all apps                |
| `apps/core`          | Engine and API                                |
| `apps/backoffice`    | Admin interface, served by Core in production |
| `apps/core/drizzle`  | Versioned SQL migrations, applied at startup  |
| `apps/core/mock`     | Fake MCP server of mock mode                  |
| `apps/display`       | Tablet PWA and its small Node server          |
| `e2e`                | Playwright journey                            |

## Core layers

| Layer             | Role                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `domain/`         | Provider and repository interfaces, pure rules (policy, normalisation) |
| `application/`    | Services orchestrating the domain                                      |
| `infrastructure/` | SQLite, Ollama, MCP SDK, AES vault, fakes                              |
| `presentation/`   | Fastify routes and WebSocket handlers                                  |
| `container.ts`    | Composition root: the only place wiring implementations                |

Replaceable providers: `LlmProvider`, `McpConnection`, `VoiceEngine`, repositories, `Vault`.

## A request

1. `AgentService.run` creates the conversation, the request and the user message.
2. If the cache applies, `CacheService.lookup` looks in the RAM index, the database, then
   optionally by embeddings. A match replays the stored calls; a failed replay falls through.
3. The request waits its turn in the queue (one at a time by default).
4. The agent resolves the model and the persona, then routes if enabled. It builds the prompt with
   the list of devices and the relevant memories, and exposes the tools allowed in the room.
5. It loops: stream the model, run requested tools in parallel, feed results back, until a final
   answer or the iteration limit.
6. It stores the answer, statistics, history, and learns a cache entry if every tool succeeded.

Every step is emitted as an event and stored in `trace_steps`; the request id links logs, tool
calls and traces.

## Resilience

- MCP: one connection attempt, then the admin reconnects by hand. Ping every 15 s.
- Ollama: health check every 30 s, failover across endpoints by priority, healthy ones first.
- A failing router, embedding model or cache replay never fails the request.
- Retention job every hour for logs, traces and history.
