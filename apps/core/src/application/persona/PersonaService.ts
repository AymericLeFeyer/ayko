import { randomUUID } from 'node:crypto';
import type { Persona, PersonaBody, PersonaFields, PersonaPreviewRequest } from '@ayko/contracts';
import { personaBody } from '@ayko/contracts';
import type { PersonaRepository } from '../../domain/persona/repositories/PersonaRepository.js';
import { renderPrompt, type PromptContext } from '../../domain/persona/services/renderPrompt.js';
import { conflict, notFound } from '../../shared/errors.js';

export const DEFAULT_PERSONA_PROMPT = `Tu es Ayko, l'assistant domestique de la maison. Tu fonctionnes entièrement en local.
Nous sommes le {{date}}, il est {{time}}. Tu parles depuis la pièce : {{room}}.
Utilise les outils disponibles pour agir sur la maison ou pour vérifier une information plutôt que de la deviner.
Si une demande est ambiguë, pose une question courte.`;

const pickFields = ({ name, systemPrompt, language, responseLength, address }: PersonaFields) => ({
  name,
  systemPrompt,
  language,
  responseLength,
  address,
});

export class PersonaService {
  /** Rendering needs room and device data the persona domain does not own. */
  private contextProvider: (roomId: string | null, user?: string) => Promise<PromptContext> =
    async () => ({ now: new Date(), roomName: null, userName: 'Admin', devices: [] });
  private onChanged: () => void = () => {};

  constructor(private readonly repository: PersonaRepository) {}

  bind(hooks: {
    context: (roomId: string | null, user?: string) => Promise<PromptContext>;
    changed: () => void;
  }) {
    this.contextProvider = hooks.context;
    this.onChanged = hooks.changed;
  }

  list() {
    return this.repository.list();
  }

  async get(id: string) {
    const persona = await this.repository.find(id);
    if (!persona) throw notFound('Persona');
    return persona;
  }

  /** Resolution order of spec 4.4: explicit choice, then room override, then default. */
  async resolve(explicitId: string | null, roomPersonaId: string | null) {
    for (const id of [explicitId, roomPersonaId]) {
      const persona = id ? await this.repository.find(id) : null;
      if (persona) return persona;
    }
    const fallback = await this.repository.findDefault();
    if (!fallback) throw notFound('Persona par défaut');
    return fallback;
  }

  async create(body: PersonaBody) {
    const fields = personaBody.parse(body);
    const persona: Persona = {
      ...fields,
      id: randomUUID(),
      isDefault: (await this.repository.list()).length === 0,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.save(persona);
    await this.snapshot(persona);
    return persona;
  }

  private async snapshot(persona: Persona) {
    await this.repository.addVersion({
      id: randomUUID(),
      personaId: persona.id,
      version: persona.version,
      snapshot: pickFields(persona),
      createdAt: persona.updatedAt,
    });
  }

  async update(id: string, patch: Partial<PersonaFields>) {
    const current = await this.get(id);
    const persona: Persona = {
      ...current,
      ...patch,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.save(persona);
    await this.snapshot(persona);
    this.onChanged();
    return persona;
  }

  async delete(id: string) {
    const persona = await this.get(id);
    if (persona.isDefault) throw conflict('Impossible de supprimer la persona par défaut');
    await this.repository.delete(id);
    this.onChanged();
  }

  async setDefault(id: string) {
    await this.get(id);
    await this.repository.setDefault(id);
    this.onChanged();
    return this.get(id);
  }

  listVersions(id: string) {
    return this.repository.listVersions(id);
  }

  /** A rollback is a new version: the history stays linear and can itself be undone. */
  async rollback(id: string, version: number) {
    const target = (await this.repository.listVersions(id)).find(
      (item) => item.version === version,
    );
    if (!target) throw notFound('Version');
    return this.update(id, target.snapshot);
  }

  async preview(id: string | null, request: PersonaPreviewRequest) {
    const base = id ? await this.get(id) : await this.resolve(null, null);
    const context = await this.contextProvider(request.roomId ?? null, request.user);
    return renderPrompt({ ...base, ...request.draft }, context);
  }

  buildContext(roomId: string | null) {
    return this.contextProvider(roomId);
  }
}
