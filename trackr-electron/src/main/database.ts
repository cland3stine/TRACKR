/**
 * TRACKR Phase 3E — SQLite Database
 *
 * Port of python/trackr/db.py.
 * Stores play count and key-value preferences using better-sqlite3 (synchronous).
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export class TrackrDatabase {
  private _db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this._db = new Database(dbPath);
    this._db.pragma('foreign_keys = ON');
    this._initSchema();
  }

  close(): void {
    this._db.close();
  }

  getPlayCount(): number {
    const row = this._db
      .prepare("SELECT value FROM counters WHERE name = 'play_count'")
      .get() as { value: number } | undefined;
    return row?.value ?? 0;
  }

  incrementPlayCount(): number {
    this._db
      .prepare("UPDATE counters SET value = value + 1 WHERE name = 'play_count'")
      .run();
    return this.getPlayCount();
  }

  getPref(key: string): string | null {
    const row = this._db
      .prepare('SELECT value FROM prefs WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setPref(key: string, value: string): void {
    this._db
      .prepare(
        'INSERT INTO prefs (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  private _initSchema(): void {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        name  TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS prefs (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO counters (name, value) VALUES ('play_count', 0);
    `);
  }
}
