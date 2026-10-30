const KEY = 'ayko.deviceToken';

/** The token survives reloads; private browsing simply means pairing again. */
export const deviceStore = {
  read() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  write(token: string) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // Storage refused: the tablet stays paired until the next reload.
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored to clear.
    }
  },
};
