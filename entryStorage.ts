import type { DbEntry } from './entryStorage.types';

const STORAGE_KEY = 'bodhinote.entries.v1';

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isDbEntry(value: unknown): value is DbEntry {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<DbEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.body === 'string' &&
    (entry.source === 'text' || entry.source === 'voice' || entry.source === 'demo') &&
    typeof entry.created_at === 'number' &&
    typeof entry.day_key === 'string' &&
    typeof entry.topics === 'string' &&
    typeof entry.tasks === 'string' &&
    typeof entry.summary === 'string'
  );
}

function sortEntries(entries: DbEntry[]) {
  return entries.sort((a, b) => b.created_at - a.created_at);
}

function readEntries() {
  const storage = getLocalStorage();
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? sortEntries(parsed.filter(isDbEntry)) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: DbEntry[]) {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(sortEntries(entries)));
}

export async function prepareEntryStorage() {
  const storage = getLocalStorage();
  if (storage && storage.getItem(STORAGE_KEY) === null) {
    storage.setItem(STORAGE_KEY, '[]');
  }
}

export async function loadEntryRecords() {
  return readEntries().slice(0, 500);
}

export async function insertEntryRecord(entry: DbEntry) {
  writeEntries([entry, ...readEntries()]);
}

export async function deleteEntryRecord(id: string) {
  writeEntries(readEntries().filter((entry) => entry.id !== id));
}

export async function searchEntryRecords(query: string, _ftsQuery: string) {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) return loadEntryRecords();

  return readEntries()
    .filter((entry) => {
      const haystack = `${entry.body} ${entry.summary} ${entry.topics}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token.replace(/^#/, '')));
    })
    .slice(0, 100);
}
