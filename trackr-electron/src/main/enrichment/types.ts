/**
 * TRACKR — Metadata Enrichment Types
 */

/** Result from a Beatport search or SQLite cache hit. */
export interface EnrichmentResult {
  year?: number;
  label?: string;
  genre?: string;
  bpm?: number;
  key?: string;
  artUrl?: string;         // Beatport dynamic_uri (original)
  artFilename?: string;    // local cached filename
  source: string;          // "beatport" | "cache"
  status: EnrichmentStatus;
}

export type EnrichmentStatus = 'pending' | 'complete' | 'failed';

/** Beatport OAuth token stored in electron-store. */
export interface BeatportToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;       // epoch ms
}

/** Beatport track from /v4/catalog/search response. */
export interface BeatportTrack {
  id: number;
  name: string;
  mixName?: string;
  artists: Array<{ id: number; name: string }>;
  bpm?: number;
  key?: string;
  genre?: string;
  subGenre?: string;
  publishDate?: string;
  label?: string;
  releaseName?: string;
  releaseId?: number;
  artUri?: string;
  artDynamicUri?: string;
}
