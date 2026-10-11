import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  getSyncState,
  insertAudioFeatures,
  insertPlaylist,
  insertPlaylistTrack,
  insertTag,
  insertTrack,
  setLastSyncedAt
} from '@smartify/db';
import { createApp } from '../src/app';

test('GET /tracks returns array with expected fields', async (t) => {
  const trackId = `api-track-${randomUUID()}`;
  const artistId = `api-artist-${randomUUID()}`;

  insertTrack({
    id: trackId,
    name: 'API Track',
    artistId,
    artistName: 'API Artist'
  });

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/tracks'
  });

  assert.equal(response.statusCode, 200);

  const body = response.json() as {
    tracks: Array<{
      id: string;
      name: string;
      artist_id: string;
      artist_name: string;
      tempo: number | null;
      energy: number | null;
      danceability: number | null;
      valence: number | null;
    }>;
  };

  assert.ok(Array.isArray(body.tracks));

  const track = body.tracks.find((item) => item.id === trackId);
  assert.ok(track);
  assert.equal(typeof track?.id, 'string');
  assert.equal(typeof track?.name, 'string');
  assert.equal(typeof track?.artist_id, 'string');
  assert.equal(typeof track?.artist_name, 'string');
  assert.equal('tempo' in (track ?? {}), true);
  assert.equal('energy' in (track ?? {}), true);
  assert.equal('danceability' in (track ?? {}), true);
  assert.equal('valence' in (track ?? {}), true);
});

test('POST /sync is non-blocking and triggers sync function', async (t) => {
  let called = false;
  let resolveSync: (() => void) | null = null;

  const pendingSync = new Promise<void>((resolve) => {
    resolveSync = resolve;
  });

  const app = await createApp({
    runSyncFn: async () => {
      called = true;
      await pendingSync;
    }
  });

  t.after(async () => {
    if (resolveSync) {
      resolveSync();
    }
    await app.close();
  });

  const start = Date.now();
  const response = await app.inject({
    method: 'POST',
    url: '/sync',
    headers: {
      authorization: 'Bearer test-access-token'
    }
  });
  const elapsedMs = Date.now() - start;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'started' });
  assert.equal(called, true);
  assert.ok(elapsedMs < 250);
});

test('GET /tracks supports tag filtering', async (t) => {
  const taggedTrackId = `api-tag-track-${randomUUID()}`;
  const taggedArtistId = `api-tag-artist-${randomUUID()}`;
  const tag = 'happy';

  insertTrack({
    id: taggedTrackId,
    name: 'Tagged API Track',
    artistId: taggedArtistId,
    artistName: 'Tagged API Artist'
  });
  insertTag(taggedTrackId, tag);

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: `/tracks?tag=${encodeURIComponent(tag)}`
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    tracks: Array<{ id: string }>;
  };
  assert.ok(Array.isArray(body.tracks));
  assert.equal(body.tracks.some((track) => track.id === taggedTrackId), true);
});

test('GET /tracks supports multi-tag filtering with AND logic', async (t) => {
  const matchingTrackId = `api-multi-tag-match-${randomUUID()}`;
  const nonMatchingTrackId = `api-multi-tag-nope-${randomUUID()}`;
  const artistId = `api-multi-tag-artist-${randomUUID()}`;
  const tagA = 'high_energy';
  const tagB = 'danceable';

  insertTrack({
    id: matchingTrackId,
    name: 'Full Match Track',
    artistId,
    artistName: 'Match Artist'
  });
  insertTag(matchingTrackId, tagA);
  insertTag(matchingTrackId, tagB);

  insertTrack({
    id: nonMatchingTrackId,
    name: 'Partial Match Track',
    artistId,
    artistName: 'Match Artist'
  });
  insertTag(nonMatchingTrackId, tagA);

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: `/tracks?tags=${encodeURIComponent(`${tagA},${tagB}`)}`
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    tracks: Array<{ id: string }>;
  };
  assert.equal(body.tracks.some((track) => track.id === matchingTrackId), true);
  assert.equal(body.tracks.some((track) => track.id === nonMatchingTrackId), false);
});

test('GET /tracks supports tempo range filtering', async (t) => {
  const inRangeTrackId = `api-range-in-${randomUUID()}`;
  const outRangeTrackId = `api-range-out-${randomUUID()}`;
  const artistId = `api-range-artist-${randomUUID()}`;

  insertTrack({
    id: inRangeTrackId,
    name: 'Tempo In Range',
    artistId,
    artistName: 'Range Artist'
  });
  insertAudioFeatures({
    trackId: inRangeTrackId,
    tempo: 100,
    energy: 0.5,
    danceability: 0.5,
    valence: 0.5
  });

  insertTrack({
    id: outRangeTrackId,
    name: 'Tempo Out Range',
    artistId,
    artistName: 'Range Artist'
  });
  insertAudioFeatures({
    trackId: outRangeTrackId,
    tempo: 140,
    energy: 0.5,
    danceability: 0.5,
    valence: 0.5
  });

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/tracks?tempo_min=90&tempo_max=120'
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    tracks: Array<{ id: string }>;
  };
  assert.equal(body.tracks.some((track) => track.id === inRangeTrackId), true);
  assert.equal(body.tracks.some((track) => track.id === outRangeTrackId), false);
});

test('GET /tracks supports combined tags and energy range filtering', async (t) => {
  const inRangeTrackId = `api-combined-in-${randomUUID()}`;
  const outRangeTrackId = `api-combined-out-${randomUUID()}`;
  const artistId = `api-combined-artist-${randomUUID()}`;
  const tag = 'medium_energy';

  insertTrack({
    id: inRangeTrackId,
    name: 'Range Matched Track',
    artistId,
    artistName: 'Combined Artist'
  });
  insertAudioFeatures({
    trackId: inRangeTrackId,
    tempo: 95,
    energy: 0.6,
    danceability: 0.6,
    valence: 0.6
  });
  insertTag(inRangeTrackId, tag);

  insertTrack({
    id: outRangeTrackId,
    name: 'Combined Out Range',
    artistId,
    artistName: 'Combined Artist'
  });
  insertAudioFeatures({
    trackId: outRangeTrackId,
    tempo: 95,
    energy: 0.9,
    danceability: 0.6,
    valence: 0.6
  });
  insertTag(outRangeTrackId, tag);

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: `/tracks?tags=${encodeURIComponent(tag)}&energy_min=0.5&energy_max=0.7`
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    tracks: Array<{ id: string }>;
  };
  assert.equal(body.tracks.some((track) => track.id === inRangeTrackId), true);
  assert.equal(body.tracks.some((track) => track.id === outRangeTrackId), false);
});

test('GET /tracks with empty filters returns all tracks behavior', async (t) => {
  const trackId = `api-empty-filter-${randomUUID()}`;
  const artistId = `api-empty-filter-artist-${randomUUID()}`;

  insertTrack({
    id: trackId,
    name: 'Empty Filter Track',
    artistId,
    artistName: 'Empty Case Artist'
  });

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/tracks?tags='
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    tracks: Array<{ id: string }>;
  };
  assert.equal(body.tracks.some((track) => track.id === trackId), true);
});

test('GET /tracks ignores invalid numeric filters safely', async (t) => {
  const trackId = `api-invalid-filter-${randomUUID()}`;
  const artistId = `api-invalid-filter-artist-${randomUUID()}`;

  insertTrack({
    id: trackId,
    name: 'Invalid Filter Track',
    artistId,
    artistName: 'Invalid Case Artist'
  });

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/tracks?tempo_min=bad&energy_max=nan&danceability_min=nope'
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    tracks: Array<{ id: string }>;
  };
  assert.equal(body.tracks.some((track) => track.id === trackId), true);
});

test('GET /tracks supports playlist_id filtering', async (t) => {
  const playlistId = `api-filter-playlist-${randomUUID()}`;
  const matchingTrackId = `api-filter-playlist-track-a-${randomUUID()}`;
  const nonMatchingTrackId = `api-filter-playlist-track-b-${randomUUID()}`;
  const artistId = `api-filter-playlist-artist-${randomUUID()}`;

  insertPlaylist({
    id: playlistId,
    name: 'Playlist Filter'
  });
  insertTrack({
    id: matchingTrackId,
    name: 'Playlist Matched',
    artistId,
    artistName: 'Playlist Artist'
  });
  insertTrack({
    id: nonMatchingTrackId,
    name: 'Playlist Not Matched',
    artistId,
    artistName: 'Playlist Artist'
  });
  insertPlaylistTrack({
    playlistId,
    trackId: matchingTrackId,
    position: 0
  });

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: `/tracks?playlist_id=${encodeURIComponent(playlistId)}`
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { tracks: Array<{ id: string }> };
  assert.equal(body.tracks.some((track) => track.id === matchingTrackId), true);
  assert.equal(body.tracks.some((track) => track.id === nonMatchingTrackId), false);
});

test('GET /tags returns unique tag list', async (t) => {
  const trackA = `api-tags-track-a-${randomUUID()}`;
  const trackB = `api-tags-track-b-${randomUUID()}`;
  const artistId = `api-tags-artist-${randomUUID()}`;
  const sharedTag = 'happy';

  insertTrack({
    id: trackA,
    name: 'Tags A',
    artistId,
    artistName: 'Tags Artist'
  });
  insertTrack({
    id: trackB,
    name: 'Tags B',
    artistId,
    artistName: 'Tags Artist'
  });
  insertTag(trackA, sharedTag);
  insertTag(trackB, sharedTag);

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/tags'
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { tags: Array<{ tag: string; count: number }> };
  assert.ok(Array.isArray(body.tags));
  const sharedTagRow = body.tags.find((entry) => entry.tag === sharedTag);
  assert.ok(sharedTagRow);
  assert.ok((sharedTagRow?.count ?? 0) >= 2);
});

test('GET /playlists returns playlists with track counts', async (t) => {
  const playlistId = `api-playlist-${randomUUID()}`;
  const trackA = `api-playlist-track-a-${randomUUID()}`;
  const trackB = `api-playlist-track-b-${randomUUID()}`;
  const artistId = `api-playlist-artist-${randomUUID()}`;

  insertPlaylist({
    id: playlistId,
    name: 'Library Playlist'
  });
  insertTrack({
    id: trackA,
    name: 'Playlist Track A',
    artistId,
    artistName: 'Playlist Artist'
  });
  insertTrack({
    id: trackB,
    name: 'Playlist Track B',
    artistId,
    artistName: 'Playlist Artist'
  });
  insertPlaylistTrack({
    playlistId,
    trackId: trackA,
    position: 0
  });
  insertPlaylistTrack({
    playlistId,
    trackId: trackB,
    position: 1
  });

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/playlists'
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as Array<{ id: string; name: string; trackCount: number }>;
  const row = body.find((item) => item.id === playlistId);
  assert.ok(row);
  assert.equal(row?.name, 'Library Playlist');
  assert.equal(row?.trackCount, 2);
});

test('GET /sync/status returns last synced timestamp', async (t) => {
  setLastSyncedAt('2026-04-22T00:00:00.000Z');

  const app = await createApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/sync/status'
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { lastSyncedAt: string | null };
  assert.equal(body.lastSyncedAt, '2026-04-22T00:00:00.000Z');

  const state = getSyncState();
  assert.equal(state.lastSyncedAt, '2026-04-22T00:00:00.000Z');
});
