/** Stores sensitive values encrypted at rest; plaintext never reaches the REST API. */
export interface Vault {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  /** Replaces (or creates) a stored JSON secret and returns its id. */
  store(value: Record<string, string>, existingId?: string | null): Promise<string>;
  read(id: string | null | undefined): Promise<Record<string, string>>;
  remove(id: string | null | undefined): Promise<void>;
}
