import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { db, getAllTracks, getTracksByTag, insertTag, insertTrack } from '../src/index';

test('db initialization creates required tables', () => {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?, ?)`
    )
    .all('artists', 'tracks', 'playlists', 'playlist_tracks', 'audio_features', 'tags') as Array<{
      name: string;
    }>;

  const tableNames = new Set(rows.map((row) => row.name));

  assert.equal(tableNames.has('artists'), true);
  assert.equal(tableNames.has('tracks'), true);
  assert.equal(tableNames.has('playlists'), true);
  assert.equal(tableNames.has('playlist_tracks'), true);
  assert.equal(tableNames.has('audio_features'), true);
  assert.equal(tableNames.has('tags'), true);
});

test('insert + read returns inserted track', () => {
  const id = `test-track-${randomUUID()}`;
  const artistId = `test-artist-${randomUUID()}`;

  insertTrack({
    id,
    name: 'Test Track',
    artistId,
    artistName: 'Test Artist'
  });

  const tracks = getAllTracks();
  const inserted = tracks.find((track) => track.id === id);

  assert.ok(inserted);
  assert.equal(inserted?.name, 'Test Track');
  assert.equal(inserted?.artist_name, 'Test Artist');
});

test('inserting same track twice is idempotent', () => {
  const id = `test-track-${randomUUID()}`;
  const artistId = `test-artist-${randomUUID()}`;

  insertTrack({
    id,
    name: 'Track Once',
    artistId,
    artistName: 'Artist Once'
  });

  insertTrack({
    id,
    name: 'Track Once',
    artistId,
    artistName: 'Artist Once'
  });

  const countRow = db.prepare('SELECT COUNT(*) AS count FROM tracks WHERE id = ?').get(id) as {
    count: number;
  };

  assert.equal(countRow.count, 1);
});

test('insert + query by tag returns tagged track', () => {
  const id = `tag-track-${randomUUID()}`;
  const artistId = `tag-artist-${randomUUID()}`;
  const tag = 'happy';

  insertTrack({
    id,
    name: 'Taggable Track',
    artistId,
    artistName: 'Taggable Artist'
  });
  insertTag(id, tag);

  const tracks = getTracksByTag(tag);
  const taggedTrack = tracks.find((track) => track.id === id);

  assert.ok(taggedTrack);
  assert.equal(taggedTrack?.name, 'Taggable Track');
});

test('inserting same tag twice is idempotent', () => {
  const id = `idempotent-tag-track-${randomUUID()}`;
  const artistId = `idempotent-tag-artist-${randomUUID()}`;
  const tag = 'danceable';

  insertTrack({
    id,
    name: 'Idempotent Track',
    artistId,
    artistName: 'Idempotent Artist'
  });

  insertTag(id, tag);
  insertTag(id, tag);

  const countRow = db
    .prepare('SELECT COUNT(*) AS count FROM tags WHERE track_id = ? AND tag = ?')
    .get(id, tag) as { count: number };

  assert.equal(countRow.count, 1);
});
