import type { Camera } from '@ayko/contracts';
import { plain } from '../../memory/services/memoryRules.js';

export interface CameraCommand {
  intent: 'show' | 'look';
  /** Null when the sentence names no camera: "mets la caméra en plein écran". */
  camera: Camera | null;
  fullscreen: boolean;
}

const WORD_OF_CAMERA = /\bcameras?\b/;
const FULLSCREEN = /\b(plein ecran|en grand)\b/;
const SHOW = /\b(montre|montres|montrez|montrer|affiche|affiches|affichez|afficher|voir)\b/;
/** Some sentences mention a camera only to act on it: those stay with the model. */
const ACT_ON = /\b(allume|eteins|coupe|active|desactive|ferme|ouvre|verrouille|deverrouille)\b/;
/** Needs an image to be answered. "Il y a" alone would catch "il y a une lampe allumée au salon". */
const LOOK = new RegExp(
  [
    "\\bqui (est|sonne|frappe|attend|c'est)\\b",
    "\\bc'est qui\\b",
    "\\bquelqu'un\\b",
    '\\bdu monde\\b',
    "\\bqu'?(est[- ]ce qu'?on|on) voit\\b",
    '\\bque vois[- ]tu\\b',
    '\\btu vois\\b',
    '\\bregarde\\b',
    "\\bjette un (oeil|coup d'oeil)\\b",
    '\\by a[- ]t[- ]il .*\\b(devant|derriere)\\b',
    '\\bil y a .*\\b(devant|derriere)\\b',
  ].join('|'),
);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Caméra Porte" is also just "porte". */
function labelsOf(camera: Camera) {
  const name = plain(camera.name);
  const short = name.replace(WORD_OF_CAMERA, '').replace(/\s+/g, ' ').trim();
  return [name, short, ...camera.aliases.map(plain)].filter(Boolean);
}

/** Longest label first: "porte du garage" must not stop at a camera named "porte". */
function namedCamera(text: string, cameras: Camera[]) {
  const labels = cameras
    .flatMap((camera) => labelsOf(camera).map((label) => ({ camera, label })))
    .sort((a, b) => b.label.length - a.label.length);
  return (
    labels.find(({ label }) => new RegExp(`\\b${escapeRegExp(label)}\\b`).test(text))?.camera ??
    null
  );
}

/**
 * Decided by code, like the memory commands: naming a camera with the right words is enough,
 * and a model could neither invent a view nor miss one. Anything else goes on to the model.
 */
export function parseCameraCommand(raw: string, cameras: Camera[]): CameraCommand | null {
  if (cameras.length === 0) return null;
  const text = plain(raw).replace(/’/g, "'");
  const camera = namedCamera(text, cameras);
  const fullscreen = FULLSCREEN.test(text);
  if (camera && LOOK.test(text)) return { intent: 'look', camera, fullscreen: false };
  const wordOfCamera = WORD_OF_CAMERA.test(text);
  if (wordOfCamera && LOOK.test(text)) return { intent: 'look', camera: null, fullscreen: false };
  if (ACT_ON.test(text)) return null;
  if (camera && (SHOW.test(text) || wordOfCamera || fullscreen)) {
    return { intent: 'show', camera, fullscreen };
  }
  return wordOfCamera ? { intent: 'show', camera: null, fullscreen } : null;
}
