import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configuredDbPath = process.env.SMARTIFY_DB_PATH?.trim();
const dbPath =
  configuredDbPath && configuredDbPath.length > 0
    ? configuredDbPath
    : path.resolve(__dirname, '../../../data/dev.db');

if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export type TrackRecord = {
  id: string;
  name: string;
  artist_id: string;
  artist_name: string;
  preview_url: string | null;
  tempo: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  playlists: Array<{ id: string; name: string }>;
  playlist_count: number;
  tags: string[];
};

export type TrackFilters = {
  tags?: string[];
  playlist_id?: string;
  tempo_min?: number;
  tempo_max?: number;
  energy_min?: number;
  energy_max?: number;
  valence_min?: number;
  valence_max?: number;
  danceability_min?: number;
  danceability_max?: number;
};

export type TagCountRecord = {
  tag: string;
  count: number;
};

export type PlaylistSummaryRecord = {
  id: string;
  name: string;
  trackCount: number;
};

export type SyncStatusRecord = {
  lastSyncedAt: string | null;
};

function normalizeTagValue(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeTrackName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  return value.length > 0 ? value : 'Unknown Track';
}

function normalizeArtistName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  return value.length > 0 ? value : 'Unknown Artist';
}

export function initSchema(): void {
  const initialize = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS artists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        artist_id TEXT NOT NULL,
        artist_name TEXT NOT NULL,
        preview_url TEXT,
        FOREIGN KEY (artist_id) REFERENCES artists(id)
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, track_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id),
        FOREIGN KEY (track_id) REFERENCES tracks(id)
      );

      CREATE TABLE IF NOT EXISTS audio_features (
        track_id TEXT PRIMARY KEY,
        tempo REAL,
        energy REAL,
        danceability REAL,
        valence REAL,
        FOREIGN KEY (track_id) REFERENCES tracks(id)
      );

      CREATE TABLE IF NOT EXISTS tags (
        track_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (track_id, tag),
        FOREIGN KEY (track_id) REFERENCES tracks(id)
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY,
        last_synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
      CREATE INDEX IF NOT EXISTS idx_audio_features_track_id ON audio_features(track_id);

      INSERT OR IGNORE INTO sync_state (id, last_synced_at)
      VALUES (1, NULL);

      DELETE FROM tags
      WHERE tag != lower(tag)
        OR tag GLOB '*[^a-z_]*'
        OR tag LIKE '% %';
    `);

    const hasPreviewColumn = db
      .prepare(`SELECT 1 FROM pragma_table_info('tracks') WHERE name = 'preview_url'`)
      .get();
    if (!hasPreviewColumn) {
      db.exec('ALTER TABLE tracks ADD COLUMN preview_url TEXT');
    }
  });

  initialize();
  console.log('[db] schema initialized');
}

initSchema();

const insertArtistStmt = db.prepare(`
  INSERT OR IGNORE INTO artists (id, name)
  VALUES (?, ?)
`);

const insertTrackStmt = db.prepare(`
  INSERT OR IGNORE INTO tracks (id, name, artist_id, artist_name, preview_url)
  VALUES (?, ?, ?, ?, ?)
`);

const insertPlaylistStmt = db.prepare(`
  INSERT INTO playlists (id, name)
  VALUES (?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name
`);

const insertPlaylistTrackStmt = db.prepare(`
  INSERT INTO playlist_tracks (playlist_id, track_id, position)
  VALUES (?, ?, ?)
  ON CONFLICT(playlist_id, track_id) DO UPDATE SET
    position = excluded.position
`);

const insertAudioFeaturesStmt = db.prepare(`
  INSERT INTO audio_features (track_id, tempo, energy, danceability, valence)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(track_id) DO UPDATE SET
    tempo = excluded.tempo,
    energy = excluded.energy,
    danceability = excluded.danceability,
    valence = excluded.valence
`);

const insertTagStmt = db.prepare(`
  INSERT INTO tags (track_id, tag)
  VALUES (?, ?)
  ON CONFLICT(track_id, tag) DO NOTHING
`);

const getAllTagsStmt = db.prepare(`
  SELECT DISTINCT tag
  FROM tags
  ORDER BY tag ASC
`);

const getTagCountsStmt = db.prepare(`
  SELECT
    tag,
    COUNT(*) AS count
  FROM tags
  GROUP BY tag
  ORDER BY count DESC, tag ASC
`);

const getPlaylistsWithTrackCountStmt = db.prepare(`
  SELECT
    p.id,
    p.name,
    COUNT(pt.track_id) AS trackCount
  FROM playlists p
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
  GROUP BY p.id, p.name
  ORDER BY p.name ASC
`);

const updateSyncStateStmt = db.prepare(`
  UPDATE sync_state
  SET last_synced_at = ?
  WHERE id = 1
`);

const getSyncStateStmt = db.prepare(`
  SELECT last_synced_at
  FROM sync_state
  WHERE id = 1
`);

export function insertTrack(params: {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  previewUrl?: string | null;
}): void {
  const trackName = normalizeTrackName(params.name);
  const artistName = normalizeArtistName(params.artistName);
  const previewUrl = params.previewUrl?.trim() ? params.previewUrl : null;

  insertArtistStmt.run(params.artistId, artistName);
  insertTrackStmt.run(params.id, trackName, params.artistId, artistName, previewUrl);
}

export function insertPlaylist(params: { id: string; name: string }): void {
  insertPlaylistStmt.run(params.id, params.name);
}

export function insertPlaylistTrack(params: {
  playlistId: string;
  trackId: string;
  position: number;
}): void {
  insertPlaylistTrackStmt.run(params.playlistId, params.trackId, params.position);
}

export function insertAudioFeatures(params: {
  trackId: string;
  tempo: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
}): void {
  insertAudioFeaturesStmt.run(
    params.trackId,
    params.tempo,
    params.energy,
    params.danceability,
    params.valence
  );
}

export function insertTag(trackId: string, tag: string): void {
  const normalizedTag = normalizeTagValue(tag);
  if (!normalizedTag) {
    return;
  }
  insertTagStmt.run(trackId, normalizedTag);
}

export function getAllTracks(): TrackRecord[] {
  return getTracksByFilters({});
}

export function getTracksByTag(tag: string): TrackRecord[] {
  return getTracksByFilters({ tags: [tag] });
}

export function getTracksByFilters(filters: TrackFilters): TrackRecord[] {
  const hasTags = Boolean(filters.tags && filters.tags.length > 0);
  const playlistIdFilter =
    typeof filters.playlist_id === 'string' && filters.playlist_id.trim().length > 0
      ? filters.playlist_id.trim()
      : null;
  const params: Array<string | number> = [];
  const whereClauses: string[] = [];

  let sql = `
    SELECT
      t.id,
      t.name,
      t.artist_id,
      t.artist_name,
      t.preview_url,
      af.tempo,
      af.energy,
      af.danceability,
      af.valence,
      COALESCE((
        SELECT json_group_array(
          json_object('id', p.id, 'name', p.name)
        )
        FROM playlist_tracks pt2
        INNER JOIN playlists p ON p.id = pt2.playlist_id
        WHERE pt2.track_id = t.id
      ), '[]') AS playlists_json,
      (
        SELECT COUNT(DISTINCT pt3.playlist_id)
        FROM playlist_tracks pt3
        WHERE pt3.track_id = t.id
      ) AS playlist_count,
      COALESCE((
        SELECT json_group_array(tg2.tag)
        FROM tags tg2
        WHERE tg2.track_id = t.id
      ), '[]') AS tags_json
    FROM tracks t
    LEFT JOIN audio_features af ON af.track_id = t.id
  `;

  if (playlistIdFilter) {
    sql += `
      INNER JOIN playlist_tracks pt_filter ON pt_filter.track_id = t.id
    `;
    whereClauses.push('pt_filter.playlist_id = ?');
    params.push(playlistIdFilter);
  }

  if (hasTags) {
    const tags = filters.tags as string[];
    const placeholders = tags.map(() => '?').join(', ');
    sql += `
      INNER JOIN tags tg ON tg.track_id = t.id
    `;
    whereClauses.push(`tg.tag IN (${placeholders})`);
    params.push(...tags);
  }

  if (typeof filters.tempo_min === 'number') {
    whereClauses.push('af.tempo >= ?');
    params.push(filters.tempo_min);
  }
  if (typeof filters.tempo_max === 'number') {
    whereClauses.push('af.tempo <= ?');
    params.push(filters.tempo_max);
  }
  if (typeof filters.energy_min === 'number') {
    whereClauses.push('af.energy >= ?');
    params.push(filters.energy_min);
  }
  if (typeof filters.energy_max === 'number') {
    whereClauses.push('af.energy <= ?');
    params.push(filters.energy_max);
  }
  if (typeof filters.valence_min === 'number') {
    whereClauses.push('af.valence >= ?');
    params.push(filters.valence_min);
  }
  if (typeof filters.valence_max === 'number') {
    whereClauses.push('af.valence <= ?');
    params.push(filters.valence_max);
  }
  if (typeof filters.danceability_min === 'number') {
    whereClauses.push('af.danceability >= ?');
    params.push(filters.danceability_min);
  }
  if (typeof filters.danceability_max === 'number') {
    whereClauses.push('af.danceability <= ?');
    params.push(filters.danceability_max);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  if (hasTags) {
    sql += `
      GROUP BY
        t.id,
        t.name,
        t.artist_id,
        t.artist_name,
        t.preview_url,
        af.tempo,
        af.energy,
        af.danceability,
        af.valence
      HAVING COUNT(DISTINCT tg.tag) = ?
    `;
    params.push((filters.tags as string[]).length);
  }

  sql += ' ORDER BY t.name ASC';

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as Array<
    Omit<TrackRecord, 'playlists' | 'tags'> & {
      playlists_json: string | null;
      tags_json: string | null;
    }
  >;

  return rows.map((row) => {
    let playlists: Array<{ id: string; name: string }> = [];
    if (row.playlists_json) {
      try {
        const parsed = JSON.parse(row.playlists_json) as Array<{ id: string; name: string }>;
        if (Array.isArray(parsed)) {
          playlists = parsed;
        }
      } catch {
        playlists = [];
      }
    }

    let tags: string[] = [];
    if (row.tags_json) {
      try {
        const parsed = JSON.parse(row.tags_json) as string[];
        if (Array.isArray(parsed)) {
          tags = parsed.filter((tag): tag is string => typeof tag === 'string');
        }
      } catch {
        tags = [];
      }
    }

    return {
      id: row.id,
      name: normalizeTrackName(row.name),
      artist_id: row.artist_id,
      artist_name: normalizeArtistName(row.artist_name),
      preview_url: row.preview_url,
      tempo: row.tempo,
      energy: row.energy,
      danceability: row.danceability,
      valence: row.valence,
      playlists,
      playlist_count: row.playlist_count,
      tags
    };
  });
}

export function getAllTags(): string[] {
  const rows = getAllTagsStmt.all() as Array<{ tag: string }>;
  return rows.map((row) => row.tag);
}

export function getTagCounts(): TagCountRecord[] {
  return getTagCountsStmt.all() as TagCountRecord[];
}

export function getPlaylistsWithTrackCount(): PlaylistSummaryRecord[] {
  return getPlaylistsWithTrackCountStmt.all() as PlaylistSummaryRecord[];
}

export function setLastSyncedAt(timestampIso: string): void {
  updateSyncStateStmt.run(timestampIso);
}

export function getSyncState(): SyncStatusRecord {
  const row = getSyncStateStmt.get() as { last_synced_at: string | null } | undefined;
  return {
    lastSyncedAt: row?.last_synced_at ?? null
  };
}

export function getSyncStatus(): SyncStatusRecord {
  return getSyncState();
}
