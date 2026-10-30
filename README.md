# Ayko

**AI You Keep Offline**: a home AI that runs 100 % locally. Ayko Core drives an Ollama model and
calls tools through MCP servers. Home Assistant is one MCP server among others.

This repository holds **Ayko Core** (engine and backoffice) and **Ayko Display** (the interface
of the tablets).

## Install in under 10 minutes

### Try it with no hardware (mock mode)

Mock mode serves demo rooms, a fake Ollama and a fake MCP server.

```bash
docker compose up --build
```

with `AYKO_MOCK=true` in `.env`.

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

The backoffice is on port 3100 and the tablet interface on port 3200.

Then, in the backoffice: add your Ollama endpoint, pull a model, assign the conversation role,
add the MCP servers and create the rooms. The dashboard lists these steps on first start.

### Development

Requires Node 22 or later.

```bash
npm install
npm run dev:mock
```

`npm run dev:mock` works in any shell and needs no configuration. `npm run dev` uses your real
setup: it needs a `.env` with `AYKO_MASTER_KEY`, and stops with that error otherwise.

The backoffice runs on <http://localhost:5173>, the tablet interface on
<http://localhost:5174>. Both proxy to Core on port 3100.

| Command             | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `npm test`          | Unit and integration tests of Core         |
| `npm run test:e2e`  | Playwright journey (needs `npm run build`) |
| `npm run lint`      | ESLint                                     |
| `npm run format`    | Prettier                                   |
| `npm run typecheck` | TypeScript strict on every workspace       |

## Tablets

1. Open `http://<display-server>:3200` on the tablet. It shows a 6-digit code.
2. In the backoffice, enter the code in **Pièces et tablettes** and choose the room.

Theme, widgets, night hours, light mode and dashboard mode are set per room and reach the tablet
without a reload.

Browsers only allow screen wake lock, offline shell and installation over HTTPS. On plain LAN HTTP,
use a kiosk browser that keeps the screen on, or put a reverse proxy in front of Display.

The Display server can run on another machine: set `AYKO_CORE_URL` and start only the `display`
service.

## Configuration

Everything is configured in the backoffice. Only startup values live in the environment; see
[.env.example](.env.example).

## Status

| Phase                   | State                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| 0. Foundations          | Done                                                                   |
| 1. Ollama and text chat | Done, verified against the fake Ollama only                            |
| 2. MCP and tool calling | Done, verified against the fake MCP server only                        |
| 3. Display v1           | Done, verified in mock mode on a desktop browser, not on a real tablet |
| 4. Persona and context  | Done, widgets need a read-only MCP tool chosen per room                |
| 5. Voice                | Out of scope. Contracts, slots and configuration screen are ready      |

### Still to validate on real hardware

- Acceptance of phases 1 and 2 with a real Ollama and the real Home Assistant MCP server.
- The Home Assistant, web search and calendar templates: their URL and packages are starting
  points and may need adjusting.
- Memory use and latency on the target machines.

### Known limits

- The context sent to the model lists the tablets of the room, not the state of home devices.
  That state comes through MCP tools.
- Rich cards need MCP tools that return `structuredContent.blocks`. Others answer in text.
- The REST API is documented in [docs/contracts.md](docs/contracts.md), not as OpenAPI.

## Documentation

- [docs/architecture.md](docs/architecture.md)
- [docs/contracts.md](docs/contracts.md)
- [DECISIONS.md](DECISIONS.md)
