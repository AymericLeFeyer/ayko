# Ayko

Dernière mise à jour : 2026-10-30

IA domestique 100 % locale. Monorepo npm : `packages/contracts`, `apps/core`, `apps/backoffice`, `apps/display`.
`apps/display` : interface tablette. Cahier des charges résumé dans `README.md`, choix dans
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
| memory       | `MemoryService`                                | `MemoryRepository`, `memoryRules`      |
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

## Display (`apps/display`)

Ports : 5174 en dev, 3200 en production. `server/server.mjs` : fichiers statiques et proxy à liste
blanche, sans dépendance ni logique métier.

| Élément               | Rôle                                                 |
| --------------------- | ---------------------------------------------------- |
| `domain/session.ts`   | Réducteur pur de l'écran, `isNight`                  |
| `CoreSocket`          | WebSocket, heartbeat 15 s, reconnexion automatique   |
| `useDevice`           | Appairage et configuration                           |
| `useConversation`     | Session, retour à l'accueil, commandes à distance    |
| `blocks/registry.tsx` | Un composant par type de bloc ; inconnu = texte brut |

Côté Core : `WidgetService` (`GET /device/widgets`), `blocksFromResult`, frame `house.activity`.
Réglages de pièce ajoutés : `nightStart`, `nightEnd`, `lightMode`, `dashboardMode`, `widgetTools`.

## Contexte du modèle (`llmLoop`)

Prompt système : persona, contexte, liste d'appareils (`HomeContextService`, outil `contextSource`),
souvenirs (`MemoryService.recall`), consigne d'action. Page backoffice : `/souvenirs` (`MemoryPage`).
Commandes `parseMemoryCommand` (« souviens-toi que », « oublie que ») traitées sans le modèle.

## Patterns

- Écran de données : `QueryState` gère chargement, erreur et vide.
- Clés de requête par domaine (`['mcp', …]`) : `useAdminSocket` et `useAction` invalident par préfixe.
- Tout nouveau secret passe par `Vault` ; l'API ne renvoie que les noms.
- `Field` enveloppe le contrôle dans un `<label>` ; passer `group` s'il contient plusieurs contrôles.
- Toute exécution d'outil passe par `AgentService.executeTool`.

## Points d'attention

- Ajouter un réglage dans `roomConfig` avec une valeur par défaut : les pièces existantes sont relues via `roomConfig.parse`.
- `tnum` sur Bricolage Grotesque donne des chiffres à empattements : le désactiver sur les grands chiffres.
- Wake Lock, service worker et installation PWA exigent HTTPS ou localhost.
- MCP : aucune reconnexion automatique, volontairement (ban IP de Home Assistant après trois 401).

- CPU et RAM d'Ollama : lus via node_exporter (`hostMetrics.ts`, `pollHostMetrics`, 5 s). L'API Ollama ne les donne pas. Le % CPU exige deux relevés.
- Les modèles annoncent des actions non faites après une simple lecture : `llmLoop` retient le texte tant qu'aucun outil d'action n'a tourné (`isActionRequest`).
- Windows : une commande Bash trop longue échoue (`ENAMETOOLONG`). Écrire les fichiers avec l'outil dédié.
- `bash` seul lance WSL dans `launch.json` ; utiliser le chemin de Git Bash.
- `contracts` se compile : relancer `npm run build -w @ayko/contracts` après modification, sinon Core et le backoffice voient l'ancienne version.
- Windows : `tsx watch` reste muet et ne démarre jamais sous `concurrently`. Core utilise `node --watch --import tsx`.
- Migrations : `apps/core/drizzle` est committé et embarqué dans l'image Docker.
- Noms de modèles avec `:` ou `/` : routes en wildcard `/ollama/models/*`.
- Le faux Ollama et le faux MCP sont de vrais serveurs : les tests couvrent le chemin de production, mais jamais un vrai modèle.
- `mcp_tools` : une modification de schéma invalide le cache via `schemaHash`, mais les choix de l'admin (alias, politique) sont conservés.
