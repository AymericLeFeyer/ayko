# Ayko

**AI You Keep Offline**: a home AI that runs 100 % locally. Ayko Core drives an Ollama model and
calls tools through MCP servers. Home Assistant is one MCP server among others.

This repository delivers **Project 1: Ayko Core and its backoffice**. Ayko Display (the tablet
interface) is not built yet; Core already exposes what it needs (`/ws/display`, pairing).

## Install in under 10 minutes

### Try it with no hardware (mock mode)

Mock mode serves demo rooms, a fake Ollama and a fake MCP server.

```bash
AYKO_MOCK=true docker compose up --build
```

Open <http://localhost:3100>, create the admin account, then go to **Terrain de jeu** and ask
« Allume la lumière du salon ».

### Real install

```bash
cp .env.example .env
```

Set `AYKO_MASTER_KEY` in `.env` (`openssl rand -hex 32`). Keep this key: losing it makes stored
secrets unreadable.

```bash
docker compose up -d --build
```

Then, in the backoffice: add your Ollama endpoint, pull a model, assign the conversation role,
add the MCP servers and create the rooms. The dashboard lists these steps on first start.

### Development

Requires Node 22 or later.

```bash
npm install
npm run build
AYKO_MOCK=true npm run dev
```

The backoffice runs on <http://localhost:5173> and proxies to Core on port 3100.

| Command             | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `npm test`          | Unit and integration tests of Core         |
| `npm run test:e2e`  | Playwright journey (needs `npm run build`) |
| `npm run lint`      | ESLint                                     |
| `npm run format`    | Prettier                                   |
| `npm run typecheck` | TypeScript strict on every workspace       |

## Configuration

Everything is configured in the backoffice. Only startup values live in the environment; see
[.env.example](.env.example).

## Status

| Phase                   | State                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| 0. Foundations          | Done                                                                    |
| 1. Ollama and text chat | Done, verified against the fake Ollama only                             |
| 2. MCP and tool calling | Done, verified against the fake MCP server only                         |
| 3. Display v1           | Not started. Core side ready: pairing, `/ws/display`, remote commands   |
| 4. Persona and context  | Backoffice side done. Tablet side and calendar widgets wait for Display |
| 5. Voice                | Out of scope. Contracts, slots and configuration screen are ready       |

### Still to validate on real hardware

- Acceptance of phases 1 and 2 with a real Ollama and the real Home Assistant MCP server.
- The Home Assistant, web search and calendar templates: their URL and packages are starting
  points and may need adjusting.
- Memory use and latency on the target machines.

### Known limits

- The context sent to the model lists the tablets of the room, not the state of home devices.
  That state comes through MCP tools.
- Core never emits `answer.blocks` yet: rich cards arrive with Display.
- The REST API is documented in [docs/contracts.md](docs/contracts.md), not as OpenAPI.

## Documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/contracts.md](docs/contracts.md)
- [DECISIONS.md](DECISIONS.md)
