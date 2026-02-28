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

  /** Increment and return the per-track play count (persists across sessions). */
  incrementTrackPlayCount(trackLine: string): number {
    this._db
      .prepare(
        'INSERT INTO track_plays (track_line, play_count) VALUES (?, 1) ' +
        'ON CONFLICT(track_line) DO UPDATE SET play_count = play_count + 1',
      )
      .run(trackLine);
    const row = this._db
      .prepare('SELECT play_count FROM track_plays WHERE track_line = ?')
      .get(trackLine) as { play_count: number } | undefined;
    return row?.play_count ?? 1;
  }

  /** Get the play count for a specific track (0 if never played). */
  getTrackPlayCount(trackLine: string): number {
    const row = this._db
      .prepare('SELECT play_count FROM track_plays WHERE track_line = ?')
      .get(trackLine) as { play_count: number } | undefined;
    return row?.play_count ?? 0;
  }

  /** Delete all per-track play counts and reset the global session counter. */
  resetAllPlayCounts(): void {
    this._db.exec("DELETE FROM track_plays");
    this._db.prepare("UPDATE counters SET value = 0 WHERE name = 'play_count'").run();
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
      CREATE TABLE IF NOT EXISTS track_plays (
        track_line  TEXT PRIMARY KEY,
        play_count  INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO counters (name, value) VALUES ('play_count', 0);
    `);
  }
}
