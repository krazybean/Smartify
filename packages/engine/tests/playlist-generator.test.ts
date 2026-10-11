import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { insertAudioFeatures, insertTrack } from '@smartify/db';
import { generatePlaylistFromFilters } from '../src/playlist-generator';

test('generatePlaylistFromFilters returns spotify URIs and respects limit', () => {
  const artistId = `engine-artist-${randomUUID()}`;
  const trackA = `engine-track-a-${randomUUID()}`;
  const trackB = `engine-track-b-${randomUUID()}`;

  insertTrack({ id: trackA, name: 'A Track', artistId, artistName: 'Engine Artist' });
  insertTrack({ id: trackB, name: 'B Track', artistId, artistName: 'Engine Artist' });

  insertAudioFeatures({
    trackId: trackA,
    tempo: 100,
    energy: 0.6,
    danceability: 0.5,
    valence: 0.5
  });
  insertAudioFeatures({
    trackId: trackB,
    tempo: 102,
    energy: 0.65,
    danceability: 0.55,
    valence: 0.55
  });

  const result = generatePlaylistFromFilters(
    { tempo_min: 90, tempo_max: 120 },
    { name: 'Focus', limit: 1 }
  );

  assert.equal(result.name, 'Focus');
  assert.equal(result.trackUris.length, 1);
  assert.equal(result.trackUris[0].startsWith('spotify:track:'), true);
});

test('generatePlaylistFromFilters defaults to limit 50', () => {
  const artistId = `engine-artist-${randomUUID()}`;

  for (let i = 0; i < 55; i += 1) {
    const trackId = `engine-track-limit-${i}-${randomUUID()}`;
    insertTrack({
      id: trackId,
      name: `Limit Track ${i}`,
      artistId,
      artistName: 'Engine Artist'
    });
    insertAudioFeatures({
      trackId,
      tempo: 100,
      energy: 0.55,
      danceability: 0.5,
      valence: 0.5
    });
  }

  const result = generatePlaylistFromFilters(
    { tempo_min: 90, tempo_max: 110, energy_min: 0.5, energy_max: 0.6 },
    { name: 'Default Limit' }
  );

  assert.equal(result.trackUris.length, 50);
});
