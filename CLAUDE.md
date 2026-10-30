# Ayko

Dernière mise à jour : 2026-10-30

IA domestique 100 % locale. Monorepo npm : `packages/contracts`, `apps/core`, `apps/backoffice`.
Ayko Display (tablettes) n'est pas commencé. Cahier des charges résumé dans `README.md`, choix dans
`DECISIONS.md`, API dans `docs/contracts.md`.

Interface en français ; code, commentaires, API et commits en anglais.

## Commandes

`npm run dev` (avec `AYKO_MOCK=true`), `npm test`, `npm run test:e2e` (après `npm run build`),
`npm run lint`, `npm run typecheck`, `npm run db:generate -w @ayko/core` (après modification du schéma).

## Domaines Core (`apps/core/src`)

| Domaine      | Service (`application/`)                       | Interfaces (`domain/`)                 |
| ------------ | ---------------------------------------------- | -------------------------------------- |
| identity     | `AuthService`                                  | `IdentityRepository`                   |
| llm          | `OllamaService`                                | `LlmProvider`, `LlmRepository`         |
| mcp          | `McpRegistry`                                  | `McpConnection`, `McpRepository`       |
| persona      | `PersonaService`                               | `PersonaRepository`, `renderPrompt`    |
| rooms        | `RoomService`, `DeviceHub`                     | `RoomRepository`                       |
| conversation | `AgentService`                                 | `ConversationRepository`, `fitHistory` |
| cache        | `CacheService`                                 | `CacheRepository`, `normalizeText`     |
| voice        | `VoiceService`                                 | `VoiceEngine`, `VoiceRepository`       |
| system       | `SystemService`, `SettingsService`, `EventBus` | `SystemRepository`, `Vault`, `Logger`  |

`AgentService.run(input, emit)` : exécute une requête jusqu'au bout, émet des `AgentEvent`, ne rejette jamais.
`container.ts` est le seul endroit qui câble les implémentations.

Endpoints : tableau complet dans `docs/contracts.md`.

## Backoffice (`apps/backoffice/src`)

Client léger : types dans `@ayko/contracts`, appels dans `infrastructure/api.ts`, pas de `fetch` ailleurs.
Design system : shadcn/ui uniquement, couleurs en variables dans `presentation/styles.css`.

| Route             | Page                | Route         | Page           |
| ----------------- | ------------------- | ------------- | -------------- |
| `/`               | `DashboardPage`     | `/pieces`     | `RoomsPage`    |
| `/ollama`         | `OllamaPage`        | `/voix`       | `VoicePage`    |
| `/mcp`            | `McpPage`           | `/historique` | `HistoryPage`  |
| `/mcp/:id`        | `McpServerPage`     | `/raccourcis` | `CachePage`    |
| `/personas`       | `PersonasPage`      | `/journaux`   | `LogsPage`     |
| `/terrain-de-jeu` | `PlaygroundPage`    | `/reglages`   | `SettingsPage` |
| `/conversations`  | `ConversationsPage` | `/traces/:id` | `TracePage`    |

| Hook               | Rôle                                              |
| ------------------ | ------------------------------------------------- |
| `useAdminSocket`   | Lien `/ws/admin`, invalide les requêtes par sujet |
| `useAction`        | Mutation avec toast et invalidation               |
| `usePlaygroundRun` | Orchestration du flux `/chat`                     |

## Patterns

- Écran de données : `QueryState` gère chargement, erreur et vide.
- Clés de requête par domaine (`['mcp', …]`) : `useAdminSocket` et `useAction` invalident par préfixe.
- Tout nouveau secret passe par `Vault` ; l'API ne renvoie que les noms.
- `Field` enveloppe le contrôle dans un `<label>` ; passer `group` s'il contient plusieurs contrôles.
- Toute exécution d'outil passe par `AgentService.executeTool`.

## Points d'attention

- Windows : une commande Bash trop longue échoue (`ENAMETOOLONG`). Écrire les fichiers avec l'outil dédié.
- `bash` seul lance WSL dans `launch.json` ; utiliser le chemin de Git Bash.
- `contracts` se compile : relancer `npm run build -w @ayko/contracts` après modification, sinon Core et le backoffice voient l'ancienne version.
- Migrations : `apps/core/drizzle` est committé et embarqué dans l'image Docker.
- Noms de modèles avec `:` ou `/` : routes en wildcard `/ollama/models/*`.
- Le faux Ollama et le faux MCP sont de vrais serveurs : les tests couvrent le chemin de production, mais jamais un vrai modèle.
- `mcp_tools` : une modification de schéma invalide le cache via `schemaHash`, mais les choix de l'admin (alias, politique) sont conservés.
