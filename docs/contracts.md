# Contracts

The source of truth is [`packages/contracts`](../packages/contracts/src). Prefix REST routes with
`/api/v1`.

Common rules: errors `{code, message, details}`, cursor pagination `{items, nextCursor}`, ISO 8601
UTC timestamps, UUID identifiers.

## Authentication

| Client     | Mechanism                                             |
| ---------- | ----------------------------------------------------- |
| Backoffice | `ayko_session` cookie (HttpOnly, SameSite=Strict)     |
| Scripts    | `Authorization: Bearer <api key>`                     |
| Tablets    | Device token: `/ws/display` and `/device/config` only |

## REST

| Domain        | Routes                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public        | `GET /health`, `GET /setup/status`, `POST /auth/setup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                                                                                                                                                       |
| Pairing       | `POST /pairing/request`, `GET /pairing/{id}`, `GET /pairing/pending`, `POST /pairing/confirm`                                                                                                                                                                                         |
| Account       | `POST /auth/password`, `GET/POST /api-keys`, `DELETE /api-keys/{id}`                                                                                                                                                                                                                  |
| Conversation  | `POST /chat` (SSE), `POST /chat/{id}/cancel`, `POST /chat/confirm`, `GET /conversations`, `GET /conversations/{id}`, `GET /traces/{requestId}`                                                                                                                                        |
| Ollama        | `GET/POST /ollama/endpoints`, `PATCH/DELETE /ollama/endpoints/{id}`, `POST /ollama/endpoints/{id}/test`, `GET /ollama/models`, `GET/DELETE /ollama/models/{name}`, `POST /ollama/models/pull` (SSE), `POST /ollama/models/test` (SSE), `GET /ollama/running`, `GET/PUT /ollama/roles` |
| MCP           | `GET /mcp/templates`, `GET/POST /mcp/servers`, `GET/PATCH/DELETE /mcp/servers/{id}`, `POST /mcp/servers/{id}/restart`, `GET /mcp/servers/{id}/tools`, `GET /mcp/servers/{id}/explore`, `PUT /mcp/tools/{id}/policy`, `POST /mcp/tools/{id}/call`, `GET /mcp/calls`                    |
| Personas      | `GET/POST /personas`, `GET/PATCH/DELETE /personas/{id}`, `POST /personas/{id}/default`, `GET /personas/{id}/versions`, `POST /personas/{id}/rollback`, `POST /personas/{id}/preview`                                                                                                  |
| Rooms         | `GET/POST /rooms`, `GET/PATCH/DELETE /rooms/{id}`, `GET /devices`, `GET/PATCH/DELETE /devices/{id}`, `POST /devices/{id}/command`, `GET /device/config` (device token)                                                                                                                |
| History/cache | `GET /history/requests`, `GET /history/requests/{id}`, `GET /cache/entries`, `GET/PATCH/DELETE /cache/entries/{id}`, `POST /cache/entries/{id}/pin`, `POST /cache/promote`, `POST /cache/clear`, `GET/PUT /cache/settings`, `GET /cache/stats`                                        |
| Memory        | `GET/POST /memories`, `PATCH/DELETE /memories/{id}`                                                                                                                                                                                                                                   |
| Voice         | `GET/PUT /voice/providers`, `POST /voice/providers/{id}/test`                                                                                                                                                                                                                         |
| System        | `GET /metrics`, `GET /logs`, `GET /audit`, `GET/PUT /settings`, `POST /config/export`, `POST /config/import`, `GET /setup/wizard`, `POST /setup/wizard/complete`                                                                                                                      |

`/health` also answers at the root, for container health checks.

Ollama endpoints and the `ollama` components of `GET /metrics` carry `host`: CPU and RAM read from
node_exporter, or null when it is unreachable.

Device-token routes: `GET /device/config`, `GET /device/widgets`.

## Rich blocks

`knownBlock` in `packages/contracts/src/blocks.ts` lists them: `text`, `entity`, `entity_list`,
`calendar_events`, `weather`, `list`, `table`, `image`, `confirm`, `progress`, `timer`, `error`. An
MCP tool returns them in `structuredContent.blocks`. The Display shows an unknown block as raw text.

## Agent events

`POST /chat` streams them as SSE; `/ws/display` carries them in the tablet envelope.

| Event              | Payload                                    |
| ------------------ | ------------------------------------------ |
| `request.accepted` | `requestId, conversationId`                |
| `state.changed`    | `state`                                    |
| `activity.step`    | `stepId, kind, label, status, durationMs?` |
| `answer.delta`     | `text`                                     |
| `answer.blocks`    | `blocks[]` (reserved until Display)        |
| `answer.done`      | `stats`                                    |
| `confirm.request`  | `confirmId, label, expiresAt`              |
| `request.failed`   | `code, message`                            |

`activity.step` kinds: `queue`, `cache_hit`, `cache_miss`, `routing`, `thinking`, `tool_call`,
`tool_result`, `confirm`, `answer`, `error`.

## `/ws/display`

Authenticate with `?token=` or a bearer header. Frames are `{type, requestId?, room, ts, payload}`.

| Direction     | Types                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tablet → Core | `user.text`, `request.cancel`, `confirm.answer`, `device.hello`, `device.heartbeat`, `audio.chunk` (ignored for now)                                                                             |
| Core → tablet | `state.changed`, `activity.step`, `answer.delta`, `answer.blocks`, `answer.done`, `confirm.request`, `config.updated`, `system.notice`, `device.command`, `house.activity`, `voice.*` (reserved) |

A tablet can only cancel its own requests and answer its own confirmations.

## `/ws/admin`

Session cookie required. Pushes `{topic}` notifications: `mcp.changed`, `ollama.changed`, `host.metrics`,
`devices.changed`, `pairing.changed`, `cache.changed`, `request.changed`, `log`.
