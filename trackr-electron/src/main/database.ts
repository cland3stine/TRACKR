/**
 * TRACKR — SQLite Database
 *
 * Stores play counts, enrichment data, and key-value preferences using better-sqlite3.
 * The `tracks` table is the unified store for per-track play counts AND enrichment metadata.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface TrackRow {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  genre: string | null;
  bpm: number | null;
  key_name: string | null;
  art_filename: string | null;
  art_url: string | null;
  source: string | null;
  enrichment_status: string;
  first_played: string;
  last_played: string;
  play_count: number;
  created_at: string;
  updated_at: string;
}

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

  // ─── session counter ────────────────────────────────────────────────────────

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

  // ─── per-track play counts (via tracks table) ──────────────────────────────

  /**
   * Increment and return the per-track play count.
   * Inserts a new row if the track doesn't exist yet (with pending enrichment).
   * Returns the updated play count.
   */
  incrementTrackPlayCount(artist: string, title: string): number {
    const now = new Date().toISOString();
    this._db.prepare(`
      INSERT INTO tracks (artist, title, first_played, last_played, play_count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(artist, title) DO UPDATE SET
        play_count = play_count + 1,
        last_played = ?,
        updated_at = ?
    `).run(artist, title, now, now, now, now);

    const row = this._db
      .prepare('SELECT play_count FROM tracks WHERE artist = ? AND title = ?')
      .get(artist, title) as { play_count: number } | undefined;
    return row?.play_count ?? 1;
  }

  /** Get the play count for a specific track (0 if never played). */
  getTrackPlayCount(artist: string, title: string): number {
    const row = this._db
      .prepare('SELECT play_count FROM tracks WHERE artist = ? AND title = ?')
      .get(artist, title) as { play_count: number } | undefined;
    return row?.play_count ?? 0;
  }

  /** Decrement a track's play count by 1. Deletes the row if count reaches 0. */
  decrementTrackPlayCount(artist: string, title: string): void {
    this._db.prepare(
      'UPDATE tracks SET play_count = play_count - 1 WHERE artist = ? AND title = ? AND play_count > 0'
    ).run(artist, title);
    this._db.prepare(
      'DELETE FROM tracks WHERE artist = ? AND title = ? AND play_count <= 0'
    ).run(artist, title);
  }

  /** Delete all tracks and reset the global session counter. */
  resetAllPlayCounts(): void {
    this._db.exec("DELETE FROM tracks");
    this._db.prepare("UPDATE counters SET value = 0 WHERE name = 'play_count'").run();
  }

  // ─── enrichment ─────────────────────────────────────────────────────────────

  /** Get a track row by artist + title. Returns null if not found. */
  getTrack(artist: string, title: string): TrackRow | null {
    return (this._db
      .prepare('SELECT * FROM tracks WHERE artist = ? AND title = ?')
      .get(artist, title) as TrackRow) ?? null;
  }

  /** Update enrichment fields for an existing track. */
  updateEnrichment(
    artist: string,
    title: string,
    fields: {
      year?: number;
      label?: string;
      genre?: string;
      bpm?: number;
      key_name?: string;
      art_filename?: string;
      art_url?: string;
      source?: string;
      enrichment_status?: string;
    },
  ): void {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(artist, title);

    this._db.prepare(
      `UPDATE tracks SET ${sets.join(', ')} WHERE artist = ? AND title = ?`
    ).run(...values);
  }

  // ─── history search ──────────────────────────────────────────────────────────

  /** Search tracks with optional full-text filter across artist, title, label, genre. */
  searchTracks(query?: string, limit = 50, offset = 0): { rows: TrackRow[]; total: number } {
    let where = '';
    const params: unknown[] = [];

    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      where = 'WHERE artist LIKE ? OR title LIKE ? OR label LIKE ? OR genre LIKE ?';
      params.push(q, q, q, q);
    }

    const countRow = this._db
      .prepare(`SELECT COUNT(*) as cnt FROM tracks ${where}`)
      .get(...params) as { cnt: number };
    const total = countRow?.cnt ?? 0;

    const rows = this._db
      .prepare(`SELECT * FROM tracks ${where} ORDER BY last_played DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as TrackRow[];

    return { rows, total };
  }

  // ─── preferences ────────────────────────────────────────────────────────────

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

  // ─── schema ─────────────────────────────────────────────────────────────────

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
      CREATE TABLE IF NOT EXISTS tracks (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        artist            TEXT NOT NULL,
        title             TEXT NOT NULL,
        year              INTEGER,
        label             TEXT,
        genre             TEXT,
        bpm               REAL,
        key_name          TEXT,
        art_filename      TEXT,
        art_url           TEXT,
        source            TEXT DEFAULT 'beatport',
        enrichment_status TEXT DEFAULT 'pending',
        first_played      TIMESTAMP NOT NULL,
        last_played       TIMESTAMP NOT NULL,
        play_count        INTEGER DEFAULT 1,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(artist, title)
      );
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_label ON tracks(label);
      CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
      CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
      INSERT OR IGNORE INTO counters (name, value) VALUES ('play_count', 0);
    `);
  }
}
