import type { ToolPolicy } from '@ayko/contracts';

const SENSITIVE = /lock|alarm|(?:^|[_-])(?:dis)?arm|door|garage|gate|cover|serrure|porte|portail/i;
const READ_ONLY = /^(get|list|read|search|fetch|query|find|show|describe)[_-]?/i;
const NEVER_CACHED = /search|recherche|web|browse|scrape|fetch_url|news/i;

/** Sensitive tools start in `confirm`: opting out of a safeguard is an explicit admin choice. */
export const defaultPolicy = (toolName: string): ToolPolicy =>
  SENSITIVE.test(toolName) ? 'confirm' : 'auto';

export const looksReadOnly = (toolName: string): boolean => READ_ONLY.test(toolName);

export const isNeverCached = (toolName: string): boolean => NEVER_CACHED.test(toolName);

export interface PolicyInput {
  enabled: boolean;
  policy: ToolPolicy;
  roomOverrides: { roomId: string; policy: ToolPolicy }[];
}

/** A disabled tool behaves as forbidden; a room override wins over the base policy. */
export function resolvePolicy(tool: PolicyInput, roomId: string | null): ToolPolicy {
  if (!tool.enabled) return 'forbidden';
  const override = roomId ? tool.roomOverrides.find((item) => item.roomId === roomId) : undefined;
  return override?.policy ?? tool.policy;
}
