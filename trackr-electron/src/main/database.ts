/**
 * TRACKR — SQLite Database
 *
 * Stores play counts, enrichment data, session history, and key-value preferences
 * using better-sqlite3.
 * The `tracks` table is the unified store for per-track play counts AND enrichment metadata.
 * The `sessions` + `session_tracks` tables store session history.
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

export interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  track_count: number;
  session_file: string | null;
  created_at: string;
}

export interface SessionTrackRow {
  id: number;
  session_id: number;
  artist: string;
  title: string;
  position: number;
  played_at: string;
}

export class TrackrDatabase {
  private _db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this._db = new Database(dbPath);
    this._db.pragma('foreign_keys = ON');
    this._initSchema();
    this._migrateSessionTracking();
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

  /** Zero out all play counts but preserve enrichment data. */
  resetAllPlayCounts(): void {
    this._db.exec("UPDATE tracks SET play_count = 0");
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

  // ─── session history ─────────────────────────────────────────────────────────

  /** Create a new session row. Returns the session ID. */
  createSession(sessionFile: string | null): number {
    const now = new Date().toISOString();
    const result = this._db.prepare(
      'INSERT INTO sessions (started_at, track_count, session_file) VALUES (?, 0, ?)'
    ).run(now, sessionFile);
    return Number(result.lastInsertRowid);
  }

  /** Mark a session as ended. */
  endSession(sessionId: number): void {
    const now = new Date().toISOString();
    this._db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, sessionId);
  }

  /** Add a track to a session and increment the session's track_count. */
  addSessionTrack(sessionId: number, artist: string, title: string, playedAt: string): void {
    const position = (this._db.prepare(
      'SELECT COALESCE(MAX(position), 0) + 1 as next FROM session_tracks WHERE session_id = ?'
    ).get(sessionId) as { next: number }).next;

    this._db.prepare(
      'INSERT INTO session_tracks (session_id, artist, title, position, played_at) VALUES (?, ?, ?, ?, ?)'
    ).run(sessionId, artist, title, position, playedAt);

    this._db.prepare(
      'UPDATE sessions SET track_count = track_count + 1 WHERE id = ?'
    ).run(sessionId);
  }

  /** Delete a session and its tracks (used by short-session purge). */
  deleteSession(sessionId: number): void {
    this._db.prepare('DELETE FROM session_tracks WHERE session_id = ?').run(sessionId);
    this._db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  /** Purge all sessions with fewer than `threshold` tracks, excluding the given ID.
   *  Also decrements per-track play counts for tracks in purged sessions. */
  purgeShortSessions(threshold: number, excludeId?: number): number {
    const rows = this._db.prepare(
      'SELECT id FROM sessions WHERE track_count < ? AND (? IS NULL OR id != ?)'
    ).all(threshold, excludeId ?? null, excludeId ?? null) as { id: number }[];
    for (const row of rows) {
      // Decrement play counts for tracks in this session before deleting
      const tracks = this._db.prepare(
        'SELECT artist, title FROM session_tracks WHERE session_id = ?'
      ).all(row.id) as { artist: string; title: string }[];
      for (const t of tracks) {
        this.decrementTrackPlayCount(t.artist, t.title);
      }
      this.deleteSession(row.id);
    }
    return rows.length;
  }

  /** Search sessions with pagination. Returns rows ordered by most recent first.
   *  Excludes empty sessions (0 tracks) so the current "in progress" placeholder doesn't show. */
  searchSessions(limit = 50, offset = 0): { rows: SessionRow[]; total: number } {
    const countRow = this._db
      .prepare('SELECT COUNT(*) as cnt FROM sessions WHERE track_count > 0')
      .get() as { cnt: number };
    const total = countRow?.cnt ?? 0;

    const rows = this._db
      .prepare('SELECT * FROM sessions WHERE track_count > 0 ORDER BY started_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as SessionRow[];

    return { rows, total };
  }

  /** Get all tracks for a session, ordered by position. Joins enrichment data from tracks table. */
  getSessionTracks(sessionId: number): (SessionTrackRow & {
    label?: string | null;
    year?: number | null;
    genre?: string | null;
    bpm?: number | null;
    key_name?: string | null;
    art_filename?: string | null;
    enrichment_status?: string;
    play_count?: number;
  })[] {
    return this._db.prepare(`
      SELECT st.*, t.label, t.year, t.genre, t.bpm, t.key_name, t.art_filename,
             t.enrichment_status, t.play_count
      FROM session_tracks st
      LEFT JOIN tracks t ON st.artist = t.artist AND st.title = t.title
      WHERE st.session_id = ?
      ORDER BY st.position ASC
    `).all(sessionId) as any[];
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

  // ─── migrations ─────────────────────────────────────────────────────────────

  /** One-time cleanup: remove tracks with no session_tracks references (transition artifact). */
  private _migrateSessionTracking(): void {
    if (this.getPref('session_tracking_migrated')) return;
    const result = this._db.prepare(`
      DELETE FROM tracks WHERE NOT EXISTS (
        SELECT 1 FROM session_tracks st WHERE st.artist = tracks.artist AND st.title = tracks.title
      )
    `).run();
    if (result.changes > 0) {
      console.log(`[db] Migration: cleaned up ${result.changes} orphaned track(s) from pre-session-tracking era`);
    }
    this.setPref('session_tracking_migrated', '1');
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

      CREATE TABLE IF NOT EXISTS sessions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at  TIMESTAMP NOT NULL,
        ended_at    TIMESTAMP,
        track_count INTEGER DEFAULT 0,
        session_file TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS session_tracks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        artist     TEXT NOT NULL,
        title      TEXT NOT NULL,
        position   INTEGER NOT NULL,
        played_at  TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session_tracks_session ON session_tracks(session_id);
    `);
  }
}
