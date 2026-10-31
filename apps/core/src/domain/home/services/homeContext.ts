import { stripAccents } from '../../cache/services/normalizeText.js';

export interface HomeDevice {
  names: string[];
  domain: string;
  state: string | null;
  area: string | null;
}

const field = (line: string, name: string) =>
  new RegExp(`^\\s+${name}:\\s*(.+)$`).exec(line)?.[1]?.trim().replace(/^'|'$/g, '') ?? null;

/** Home Assistant wraps its overview in `{"result": "..."}`. */
function unwrap(text: string) {
  try {
    const value = JSON.parse(text) as { result?: unknown };
    return typeof value.result === 'string' ? value.result : text;
  } catch {
    return text;
  }
}

/** Reads the device list of Home Assistant's GetLiveContext. */
export function parseLiveContext(text: string): HomeDevice[] {
  const devices: HomeDevice[] = [];
  for (const line of unwrap(text).split('\n')) {
    const names = /^- names:\s*(.+)$/.exec(line)?.[1];
    if (names) {
      devices.push({
        names: names.split(',').map((name) => name.trim()),
        domain: 'inconnu',
        state: null,
        area: null,
      });
      continue;
    }
    const device = devices[devices.length - 1];
    if (!device) continue;
    device.domain = field(line, 'domain') ?? device.domain;
    device.state = field(line, 'state') ?? device.state;
    device.area = field(line, 'areas') ?? device.area;
  }
  return devices;
}

const sameName = (left: string | null, right: string | null) =>
  left !== null &&
  right !== null &&
  stripAccents(left.toLowerCase()) === stripAccents(right.toLowerCase());

/** Home Assistant targets devices through `name` and `area`: returns the first invented one. */
export function unknownTarget(args: Record<string, unknown>, devices: HomeDevice[]): string | null {
  const known = (value: string, candidates: (string | null)[]) =>
    candidates.some((candidate) => sameName(value, candidate));
  const { name, area } = args;
  if (
    typeof name === 'string' &&
    !known(
      name,
      devices.flatMap((device) => device.names),
    )
  ) {
    return name;
  }
  if (
    typeof area === 'string' &&
    !known(
      area,
      devices.map((device) => device.area),
    )
  ) {
    return area;
  }
  return null;
}

const describe = (device: HomeDevice) =>
  `- ${device.names.join(', ')} (${device.domain})${device.state ? ` : ${device.state}` : ''}`;

/**
 * Compact catalogue for the system prompt. The room being spoken from comes first, so
 * that when the budget runs out it is the rest of the house that gets cut.
 */
export function renderHomeContext(
  devices: HomeDevice[],
  roomName: string | null,
  maxChars: number,
): string {
  const areas = new Map<string, HomeDevice[]>();
  const ordered = [...devices].sort(
    (a, b) => Number(sameName(b.area, roomName)) - Number(sameName(a.area, roomName)),
  );
  for (const device of ordered) {
    const area = device.area ?? 'Sans pièce';
    areas.set(area, [...(areas.get(area) ?? []), device]);
  }

  const lines = [
    "Appareils de la maison. Utilise exactement ces noms, et fie-toi à cette liste pour l'état :",
  ];
  let used = lines[0]?.length ?? 0;
  let dropped = 0;
  for (const [area, members] of areas) {
    for (const [index, device] of members.entries()) {
      const text = index === 0 ? `${area} :\n${describe(device)}` : describe(device);
      if (used + text.length > maxChars) {
        dropped += 1;
        continue;
      }
      lines.push(text);
      used += text.length + 1;
    }
  }
  if (dropped > 0) lines.push(`(${dropped} autres appareils non listés)`);
  return lines.join('\n');
}
