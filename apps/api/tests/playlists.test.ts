import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app';

test('POST /playlists/generate returns 400 when no tracks found', async (t) => {
  const app = await createApp({
    generatePlaylistFromFiltersFn: () => ({
      name: 'Empty Result',
      trackUris: []
    })
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/playlists/generate',
    headers: {
      authorization: 'Bearer test-access-token'
    },
    payload: {
      name: 'Empty Playlist',
      tags: ['high_energy']
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: 'No tracks found for the provided filters.'
  });
});

test('POST /playlists/generate creates playlist and adds deduped tracks', async (t) => {
  const calls: {
    createPlaylist?: { accessToken: string; userId: string; name: string };
    addedUris?: string[];
  } = {};

  const app = await createApp({
    generatePlaylistFromFiltersFn: () => ({
      name: 'Generated Playlist',
      trackUris: [
        'spotify:track:1',
        'spotify:track:2',
        'spotify:track:1',
        'spotify:track:2',
        'spotify:track:3'
      ]
    }),
    spotifyPlaylistClient: {
      getCurrentUser: async () => ({
        id: 'user-123',
        display_name: 'Tester'
      }),
      createPlaylist: async (accessToken, userId, name) => {
        calls.createPlaylist = { accessToken, userId, name };
        return 'playlist-abc';
      },
      addTracksToPlaylist: async (_accessToken, _playlistId, trackUris) => {
        calls.addedUris = trackUris;
      }
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/playlists/generate',
    headers: {
      authorization: 'Bearer test-access-token'
    },
    payload: {
      name: 'My Playlist',
      tags: ['danceable'],
      energy_min: 0.5
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    playlistId: 'playlist-abc',
    trackCount: 3
  });

  assert.deepEqual(calls.createPlaylist, {
    accessToken: 'test-access-token',
    userId: 'user-123',
    name: 'Generated Playlist'
  });
  assert.deepEqual(calls.addedUris, ['spotify:track:1', 'spotify:track:2', 'spotify:track:3']);
});

test('POST /playlists/generate returns 500 when spotify call fails', async (t) => {
  const app = await createApp({
    generatePlaylistFromFiltersFn: () => ({
      name: 'Failure Playlist',
      trackUris: ['spotify:track:1']
    }),
    spotifyPlaylistClient: {
      getCurrentUser: async () => ({
        id: 'user-123',
        display_name: 'Tester'
      }),
      createPlaylist: async () => {
        throw new Error('spotify failed');
      },
      addTracksToPlaylist: async () => {
        throw new Error('not used');
      }
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/playlists/generate',
    headers: {
      authorization: 'Bearer test-access-token'
    },
    payload: {
      name: 'Should Fail'
    }
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: 'Failed to generate playlist.'
  });
});

test('POST /playlists/create-from-tracks returns 400 when no trackIds provided', async (t) => {
  const app = await createApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/playlists/create-from-tracks',
    headers: {
      authorization: 'Bearer test-access-token'
    },
    payload: {
      name: 'Builder Playlist',
      trackIds: []
    }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: 'No tracks found for the provided selection.'
  });
});

test('POST /playlists/create-from-tracks creates playlist and dedupes trackIds', async (t) => {
  const calls: {
    createPlaylist?: { accessToken: string; userId: string; name: string };
    addedUris?: string[];
  } = {};

  const app = await createApp({
    spotifyPlaylistClient: {
      getCurrentUser: async () => ({
        id: 'user-123',
        display_name: 'Tester'
      }),
      createPlaylist: async (accessToken, userId, name) => {
        calls.createPlaylist = { accessToken, userId, name };
        return 'playlist-builder';
      },
      addTracksToPlaylist: async (_accessToken, _playlistId, trackUris) => {
        calls.addedUris = trackUris;
      }
    }
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/playlists/create-from-tracks',
    headers: {
      authorization: 'Bearer test-access-token'
    },
    payload: {
      name: 'Builder Playlist',
      trackIds: ['a', 'b', 'a', 'c']
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    playlistId: 'playlist-builder',
    trackCount: 3
  });
  assert.deepEqual(calls.createPlaylist, {
    accessToken: 'test-access-token',
    userId: 'user-123',
    name: 'Builder Playlist'
  });
  assert.deepEqual(calls.addedUris, ['spotify:track:a', 'spotify:track:b', 'spotify:track:c']);
});
