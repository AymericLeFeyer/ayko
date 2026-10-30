import type { Persona, PersonaVersion } from '@ayko/contracts';

export interface PersonaRepository {
  list(): Promise<Persona[]>;
  find(id: string): Promise<Persona | null>;
  findDefault(): Promise<Persona | null>;
  save(persona: Persona): Promise<void>;
  delete(id: string): Promise<boolean>;
  setDefault(id: string): Promise<void>;
  listVersions(personaId: string): Promise<PersonaVersion[]>;
  addVersion(version: PersonaVersion): Promise<void>;
}
