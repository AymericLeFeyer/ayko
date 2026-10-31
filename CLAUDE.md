# Ayko

Dernière mise à jour : 2026-10-31

IA domestique 100 % locale. Monorepo npm : `packages/contracts`, `apps/core`, `apps/backoffice`, `apps/display`.
`apps/display` : interface tablette. Cahier des charges résumé dans `README.md`, choix dans
`DECISIONS.md`, API dans `docs/contracts.md`.

Interface en français ; code, commentaires, API et commits en anglais.

## Commandes

`npm run dev` (avec `AYKO_MOCK=true`), `npm test`, `npm run test:e2e` (après `npm run build`),
`npm run lint`, `npm run typecheck`, `npm run db:generate -w @ayko/core` (après modification du schéma).

## Domaines Core (`apps/core/src`)

| Domaine      | Service (`application/`)                       | Interfaces (`domain/`)                                     |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------- |
| identity     | `AuthService`                                  | `IdentityRepository`                                       |
| llm          | `OllamaService`                                | `LlmProvider`, `LlmRepository`                             |
| mcp          | `McpRegistry`                                  | `McpConnection`, `McpRepository`                           |
| persona      | `PersonaService`                               | `PersonaRepository`, `renderPrompt`                        |
| rooms        | `RoomService`, `DeviceHub`                     | `RoomRepository`                                           |
| conversation | `AgentService`, `ReportService`                | `ConversationRepository`, `fitHistory`, `ReportRepository` |
| cache        | `CacheService`                                 | `CacheRepository`, `normalizeText`                         |
| memory       | `MemoryService`                                | `MemoryRepository`, `memoryRules`                          |
| voice        | `VoiceService`                                 | `VoiceEngine`, `VoiceRepository`                           |
| system       | `SystemService`, `SettingsService`, `EventBus` | `SystemRepository`, `Vault`, `Logger`                      |

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

Écran de conversation : orbe au centre, journaux réduits sous la scène, texte en bulles en bas à
gauche, blocs en orbite, barre de saisie centrée (720 px max). Le display garde 3 échanges
(`VISIBLE_EXCHANGES`, sans effet sur le contexte du modèle) et 3 satellites (`SATELLITE_SLOTS`) ;
`launch()` dans `session.ts` remplace la carte d'un même appareil. Tout nouveau type de bloc gravite
dès qu'il est dans `blocks/registry.tsx`. Les satellites sont ancrés au bord de l'orbe (`--orb`,
`--orb-gap-x`, `--orb-gap-y` sur `.stage`) et s'en éloignent en grandissant.
Une action sans bloc reçoit une carte `actionBlock` (`toolBlocks.ts`) : état déduit du nom de l'outil,
pas relu sur l'appareil. La tablette ne passe plus en plein écran au clic.

Cartes : `domain/blockLook.ts` déduit du texte libre la couleur (`entityTone`, `data-tone` → `--tone`),
l'icône d'appareil (`entityKind`) et la météo (`weatherKind`). Un état inconnu reste neutre.
Une entité avec `action` est cliquable en entier : le tap envoie `action.text` comme un message, donc
il repasse par l'agent. `actionBlock` fournit l'ordre inverse pour `turn_on`/`turn_off` si la cible
est connue (`args.name`, `area`, `room`).

## Signalements

Bouton « Signaler » du display → `POST /device/reports` → `ReportService.create(device)` : copie les
4 dernières traces (prompt, raisonnement, outils) de la dernière conversation de la tablette dans
`reports`, jamais purgée. Page `/signalements` (`ReportsPage`).

Pour analyser les N dernières bizarreries : `GET /api/v1/reports?limit=N` avec une clé API, ou le
JSON de « Télécharger les 10 derniers ». Comparer `prompt`, `toolCalls` et `answer` de chaque trace.

## Contexte du modèle (`llmLoop`)

Prompt système : persona, contexte, liste d'appareils (`HomeContextService`, outil `contextSource`),
souvenirs (`MemoryService.recall`), consigne d'action. Page backoffice : `/souvenirs` (`MemoryPage`).
Commandes `parseMemoryCommand` (« souviens-toi que », « oublie que ») traitées sans le modèle.

Routage : `routingPrompt` liste les serveurs connectés et leurs outils (8 par serveur) ; sans outil
exposé, pas d'inférence de routage. `fitHistory` compte les schémas d'outils dans le budget.

## Raccourcis dictés

« Quand je dis X, tu fais Y » : pas de MCP (il ne pourrait ni écrire dans le cache ni voir la pièce)
ni d'outil exposé au modèle (il pourrait exécuter au lieu d'enregistrer). `parseShortcutCommand`
(`domain/cache/services/shortcutCommand.ts`) reconnaît la phrase, avant les commandes de mémoire,
et découpe les « ou » (« allume ou éteins la lumière » donne deux phrases, donc deux raccourcis).
`AgentService.teachShortcut` fait traduire chaque phrase + Y en appels d'outils par le modèle : ils sont
capturés, jamais exécutés, puis vérifiés (`argumentProblem`, `unknownTarget` sur les serveurs
source de contexte). Un refus annule tout le raccourci. `CacheService.saveManual({text, roomId,
calls, durationMs})` crée l'entrée `origin: 'manual'`, épinglée, rattachée à la pièce, ou globale
sans pièce. Le rejeu passe par `executeTool` : les confirmations s'appliquent à chaque usage.

## Patterns

- Écran de données : `QueryState` gère chargement, erreur et vide.
- Clés de requête par domaine (`['mcp', …]`) : `useAdminSocket` et `useAction` invalident par préfixe.
- Tout nouveau secret passe par `Vault` ; l'API ne renvoie que les noms.
- `Field` enveloppe le contrôle dans un `<label>` ; passer `group` s'il contient plusieurs contrôles.
- Toute exécution d'outil passe par `AgentService.executeTool`.

## Points d'attention

- Raccourcis approximatifs : les embeddings jugent « sur 18 » et « sur 20 », ou « allume » et « éteins », quasi identiques. `sameCommand` exige les mêmes nombres et verbes d'action avant tout rapprochement.

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
- Raccourci manuel : `learn` ne l'écrase jamais, `lookup` ignore `isCacheableText` pour lui (« ça caille »), et un rejeu raté répond l'échec au lieu de repartir au modèle.
- `ACTION_VERBS` reste domotique : ajouter « envoyer » ou « créer » ferait passer une simple discussion pour une action due. L'étendre seulement avec un serveur qui en a besoin.
- `learnAliases` lit `args.name` de tout outil d'action : avec un serveur non domotique, il faudra le limiter aux serveurs source de contexte.
- `mcp_tools` : une modification de schéma invalide le cache via `schemaHash`, mais les choix de l'admin (alias, politique) sont conservés.
