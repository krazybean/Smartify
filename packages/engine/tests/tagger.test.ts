import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTagsForTrack } from '../src/tagger';

test('generateTagsForTrack applies deterministic tag rules', () => {
  const track = {
    id: 'track-1',
    name: 'Track One',
    artistId: 'artist-1',
    artistName: 'Artist One'
  };

  const tags = generateTagsForTrack(track, {
    tempo: 130,
    energy: 0.8,
    danceability: 0.9,
    valence: 0.8
  });

  assert.deepEqual(tags, ['fast', 'high_energy', 'happy', 'danceable']);
});

test('generateTagsForTrack handles lower ranges and boundaries', () => {
  const track = {
    id: 'track-2',
    name: 'Track Two',
    artistId: 'artist-2',
    artistName: 'Artist Two'
  };

  const slowLow = generateTagsForTrack(track, {
    tempo: 80,
    energy: 0.3,
    danceability: 0.2,
    valence: 0.2
  });
  assert.deepEqual(slowLow, ['slow', 'low_energy', 'sad']);

  const medium = generateTagsForTrack(track, {
    tempo: 120,
    energy: 0.7,
    danceability: 0.7,
    valence: 0.5
  });
  assert.deepEqual(medium, ['medium', 'medium_energy']);
});
