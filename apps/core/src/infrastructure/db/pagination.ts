import { and, desc, lt, or, eq, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Page } from '@ayko/contracts';

export const encodeCursor = (sort: string, id: string): string =>
  Buffer.from(JSON.stringify([sort, id])).toString('base64url');

function decodeCursor(cursor: string): [string, string] | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    return Array.isArray(value) && value.length === 2 ? (value as [string, string]) : null;
  } catch {
    return null;
  }
}

/** Keyset condition for rows ordered by `(sortColumn DESC, id DESC)`. */
export function cursorCondition(
  sortColumn: SQLiteColumn,
  idColumn: SQLiteColumn,
  cursor: string | undefined,
): SQL | undefined {
  const parsed = cursor ? decodeCursor(cursor) : null;
  if (!parsed) return undefined;
  const [sort, id] = parsed;
  return or(lt(sortColumn, sort), and(eq(sortColumn, sort), lt(idColumn, id)));
}

export const newestFirst = (sortColumn: SQLiteColumn, idColumn: SQLiteColumn) =>
  [desc(sortColumn), desc(idColumn)] as const;

/** Callers fetch `limit + 1` rows; the extra one only proves a next page exists. */
export function toPage<R, T>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
  key: (row: R) => [string, string],
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items: items.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(...key(last)) : null,
  };
}
