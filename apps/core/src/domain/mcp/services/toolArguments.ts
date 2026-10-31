interface PropertySchema {
  type?: string | string[];
  enum?: unknown[];
}

interface ObjectSchema {
  properties?: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: unknown;
}

const typeOf = (value: unknown) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
};

const matchesType = (value: unknown, type: string) =>
  type === 'integer' ? Number.isInteger(value) : typeOf(value) === type;

/**
 * Checks what a stored call can get wrong without running it. Enough of JSON Schema to
 * catch an invented argument; the server stays the judge of everything else.
 */
export function argumentProblem(schema: unknown, args: Record<string, unknown>): string | null {
  const { properties = {}, required = [], additionalProperties } = (schema ?? {}) as ObjectSchema;
  for (const name of required) {
    if (args[name] === undefined) return `argument manquant : ${name}`;
  }
  for (const [name, value] of Object.entries(args)) {
    const property = properties[name];
    if (!property) {
      if (additionalProperties === false) return `argument inconnu : ${name}`;
      continue;
    }
    const types = property.type === undefined ? [] : [property.type].flat();
    if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
      return `type incorrect pour ${name}`;
    }
    if (property.enum && !property.enum.includes(value)) {
      return `valeur non autorisée pour ${name} : ${String(value)}`;
    }
  }
  return null;
}
