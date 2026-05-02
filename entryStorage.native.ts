import * as SQLite from 'expo-sqlite';

import type { DbEntry } from './entryStorage.types';

const db = SQLite.openDatabaseSync('bodhinote.db');

export async function prepareEntryStorage() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      topics TEXT NOT NULL,
      tasks TEXT NOT NULL,
      summary TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      body,
      summary,
      topics,
      content='entries',
      content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, body, summary, topics)
      VALUES (new.rowid, new.body, new.summary, new.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, body, summary, topics)
      VALUES('delete', old.rowid, old.body, old.summary, old.topics);
    END;
  `);
}

export async function loadEntryRecords() {
  return db.getAllAsync<DbEntry>('SELECT * FROM entries ORDER BY created_at DESC LIMIT 500');
}

export async function insertEntryRecord(entry: DbEntry) {
  await db.runAsync(
    `INSERT INTO entries (id, body, source, created_at, day_key, topics, tasks, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.body,
    entry.source,
    entry.created_at,
    entry.day_key,
    entry.topics,
    entry.tasks,
    entry.summary,
  );
}

export async function deleteEntryRecord(id: string) {
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

export async function searchEntryRecords(query: string, ftsQuery: string) {
  try {
    return await db.getAllAsync<DbEntry>(
      `SELECT entries.*
       FROM entries_fts
       JOIN entries ON entries_fts.rowid = entries.rowid
       WHERE entries_fts MATCH ?
       ORDER BY bm25(entries_fts), entries.created_at DESC
       LIMIT 100`,
      ftsQuery,
    );
  } catch {
    return db.getAllAsync<DbEntry>(
      'SELECT * FROM entries WHERE body LIKE ? OR summary LIKE ? OR topics LIKE ? ORDER BY created_at DESC LIMIT 100',
      `%${query}%`,
      `%${query}%`,
      `%${query}%`,
    );
  }
}
