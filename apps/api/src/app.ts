import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import {
  getSyncState,
  getPlaylistsWithTrackCount,
  getTagCounts,
  getAllTracks,
  getTracksByFilters,
  getTracksByTag,
  setLastSyncedAt,
  type TrackFilters,
  insertPlaylist,
  insertPlaylistTrack,
  insertTag,
  insertTrack
} from '@smartify/db';
import { generatePlaylistFromFilters } from '@smartify/engine';
import {
  addTracksToPlaylist,
  createPlaylist,
  exchangeCodeForToken,
  getCurrentUser,
  getPlaylistTracks,
  getUserPlaylists
} from '@smartify/spotify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const spotifyScopes = ['playlist-read-private', 'playlist-read-collaborative', 'user-read-email'];

function getAccessTokenFromAuthorizationHeader(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function derivePlaylistTag(playlistName: string): string | null {
  const tokens = playlistName
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  return tokens.length > 0 ? tokens[0] : null;
}

export async function runSync(accessToken: string): Promise<void> {
  try {
    console.log('[sync] started');
    console.log('token:', accessToken?.slice(0, 10));

    const playlists = await getUserPlaylists(accessToken);
    const playlistMembershipByTrack = new Map<string, Set<string>>();

    for (const playlist of playlists) {
      insertPlaylist({ id: playlist.id, name: playlist.name });

      const tracks = await getPlaylistTracks(accessToken, playlist.id);
      const playlistTag = derivePlaylistTag(playlist.name);

      tracks.forEach((track, index) => {
        insertTrack({
          id: track.id,
          name: track.name,
          artistId: track.artistId,
          artistName: track.artistName,
          previewUrl: track.previewUrl
        });

        insertPlaylistTrack({
          playlistId: playlist.id,
          trackId: track.id,
          position: index
        });

        if (playlistTag) {
          insertTag(track.id, playlistTag);
        }

        if (typeof track.popularity === 'number') {
          if (track.popularity > 70) {
            insertTag(track.id, 'popular');
          } else if (track.popularity < 30) {
            insertTag(track.id, 'underground');
          }
        }

        const memberships = playlistMembershipByTrack.get(track.id) ?? new Set<string>();
        memberships.add(playlist.id);
        playlistMembershipByTrack.set(track.id, memberships);
      });
    }

    for (const [trackId, memberships] of playlistMembershipByTrack.entries()) {
      if (memberships.size > 1) {
        insertTag(trackId, 'frequent');
      }
    }

    console.warn('Skipping audio features (temporarily disabled)');
    setLastSyncedAt(new Date().toISOString());
    console.log('[sync] completed');
  } catch (error) {
    console.error('[sync] error', error);
  }
}

type CreateAppOptions = {
  runSyncFn?: (accessToken: string) => Promise<void>;
  generatePlaylistFromFiltersFn?: typeof generatePlaylistFromFilters;
  spotifyPlaylistClient?: {
    getCurrentUser: typeof getCurrentUser;
    createPlaylist: typeof createPlaylist;
    addTracksToPlaylist: typeof addTracksToPlaylist;
  };
};

export async function createApp(options?: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: 'http://localhost:3000',
    credentials: false
  });

  const runSyncFn = options?.runSyncFn ?? runSync;
  const generatePlaylistFromFiltersFn =
    options?.generatePlaylistFromFiltersFn ?? generatePlaylistFromFilters;
  const spotifyPlaylistClient = options?.spotifyPlaylistClient ?? {
    getCurrentUser,
    createPlaylist,
    addTracksToPlaylist
  };

  app.get('/health', async () => {
    return { status: 'OK' };
  });

  app.get('/auth/login', async (_request, reply) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: requiredEnv('SPOTIFY_CLIENT_ID'),
      scope: spotifyScopes.join(' '),
      redirect_uri: requiredEnv('SPOTIFY_REDIRECT_URI')
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    return reply.redirect(authUrl);
  });

  app.get('/auth/callback', async (request, reply) => {
    const code = (request.query as { code?: string }).code;
    if (!code) {
      return reply.status(400).send({ error: 'Missing code' });
    }

    const token = await exchangeCodeForToken(code);
    const accessToken = token.access_token;
    const user = await getCurrentUser(accessToken);
    console.log('Authenticated user:', user.display_name ?? user.id);

    return reply.redirect(`http://localhost:3000/dashboard?token=${encodeURIComponent(accessToken)}`);
  });

  app.get('/auth/me', async (request) => {
    const accessToken = getAccessTokenFromAuthorizationHeader(
      typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined
    );
    if (!accessToken) {
      return {
        isAuthenticated: false
      };
    }

    return {
      isAuthenticated: true,
      user: {
        name: 'Spotify User'
      }
    };
  });

  const handleLogout = async () => {
    return {
      success: true
    };
  };

  app.post('/auth/logout', async () => {
    return handleLogout();
  });

  app.post('/api/auth/logout', async () => {
    return handleLogout();
  });

  app.post('/sync', async (request, reply) => {
    const accessToken = getAccessTokenFromAuthorizationHeader(
      typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined
    );
    if (!accessToken) {
      return reply.status(401).send({ error: 'Not authenticated. Login first.' });
    }
    console.log('token:', accessToken?.slice(0, 10));

    void runSyncFn(accessToken);

    return { status: 'started' };
  });

  app.get('/sync/status', async () => {
    return getSyncState();
  });

  app.get('/tracks', async (request) => {
    const query = request.query as {
      tag?: string;
      tags?: string;
      playlist_id?: string;
      tempo_min?: string;
      tempo_max?: string;
      energy_min?: string;
      energy_max?: string;
      valence_min?: string;
      valence_max?: string;
      danceability_min?: string;
      danceability_max?: string;
    };

    const parseNumber = (value?: string): number | undefined => {
      if (!value) {
        return undefined;
      }
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const tagsFromTagsQuery = (query.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const legacyTag = query.tag?.trim();
    const combinedTags = Array.from(
      new Set([
        ...tagsFromTagsQuery,
        ...(legacyTag && !tagsFromTagsQuery.includes(legacyTag) ? [legacyTag] : [])
      ])
    );

    const logTracksFromDb = (
      tracks: Array<{ name?: string; artist_name?: string }>
    ): void => {
      tracks.slice(0, 10).forEach((track) => {
        console.log('track from DB:', track.name);
      });
    };

    if (query.tag && combinedTags.length === 1 && !query.tags) {
      const tracks = getTracksByTag(combinedTags[0]);
      logTracksFromDb(tracks);
      return { tracks };
    }

    const filters = {
      tags: combinedTags.length > 0 ? combinedTags : undefined,
      playlist_id: query.playlist_id?.trim() ? query.playlist_id.trim() : undefined,
      tempo_min: parseNumber(query.tempo_min),
      tempo_max: parseNumber(query.tempo_max),
      energy_min: parseNumber(query.energy_min),
      energy_max: parseNumber(query.energy_max),
      valence_min: parseNumber(query.valence_min),
      valence_max: parseNumber(query.valence_max),
      danceability_min: parseNumber(query.danceability_min),
      danceability_max: parseNumber(query.danceability_max)
    };

    if (filters.playlist_id) {
      console.log('playlist filter:', filters.playlist_id);
    }
    console.log('filters:', filters);

    const hasFilters =
      (filters.tags?.length ?? 0) > 0 ||
      filters.playlist_id !== undefined ||
      filters.tempo_min !== undefined ||
      filters.tempo_max !== undefined ||
      filters.energy_min !== undefined ||
      filters.energy_max !== undefined ||
      filters.valence_min !== undefined ||
      filters.valence_max !== undefined ||
      filters.danceability_min !== undefined ||
      filters.danceability_max !== undefined;

    if (!hasFilters) {
      const tracks = getAllTracks();
      logTracksFromDb(tracks);
      return { tracks };
    }

    const tracks = getTracksByFilters(filters);
    logTracksFromDb(tracks);
    return { tracks };
  });

  app.get('/tags', async () => {
    return { tags: getTagCounts() };
  });

  app.get('/playlists', async () => {
    return getPlaylistsWithTrackCount();
  });

  app.post('/playlists/generate', async (request, reply) => {
    const accessToken = getAccessTokenFromAuthorizationHeader(
      typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined
    );
    if (!accessToken) {
      return reply.status(401).send({ error: 'Not authenticated. Login first.' });
    }

    const body = (request.body ?? {}) as {
      name?: string;
      tags?: unknown;
      tempo_min?: unknown;
      tempo_max?: unknown;
      energy_min?: unknown;
      energy_max?: unknown;
      valence_min?: unknown;
      valence_max?: unknown;
      danceability_min?: unknown;
      danceability_max?: unknown;
      limit?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return reply.status(400).send({ error: 'Playlist name is required.' });
    }

    const parseNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };

    const tags =
      Array.isArray(body.tags) && body.tags.length > 0
        ? body.tags
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : undefined;

    const filters: TrackFilters = {
      tags: tags && tags.length > 0 ? tags : undefined,
      tempo_min: parseNumber(body.tempo_min),
      tempo_max: parseNumber(body.tempo_max),
      energy_min: parseNumber(body.energy_min),
      energy_max: parseNumber(body.energy_max),
      valence_min: parseNumber(body.valence_min),
      valence_max: parseNumber(body.valence_max),
      danceability_min: parseNumber(body.danceability_min),
      danceability_max: parseNumber(body.danceability_max)
    };

    const limit = parseNumber(body.limit);

    try {
      console.log('[playlist] generating');
      const generated = generatePlaylistFromFiltersFn(filters, {
        name,
        limit: limit !== undefined ? limit : undefined
      });
      const trackUris = Array.from(new Set(generated.trackUris));

      if (trackUris.length === 0) {
        return reply.status(400).send({ error: 'No tracks found for the provided filters.' });
      }

      const user = await spotifyPlaylistClient.getCurrentUser(accessToken);
      const playlistId = await spotifyPlaylistClient.createPlaylist(accessToken, user.id, generated.name);
      console.log('[playlist] created');

      await spotifyPlaylistClient.addTracksToPlaylist(accessToken, playlistId, trackUris);
      console.log('[playlist] tracks added');

      return {
        playlistId,
        trackCount: trackUris.length
      };
    } catch (error) {
      console.error('[playlist] error', error);
      return reply.status(500).send({ error: 'Failed to generate playlist.' });
    }
  });

  app.post('/playlists/create-from-tracks', async (request, reply) => {
    const accessToken = getAccessTokenFromAuthorizationHeader(
      typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined
    );
    if (!accessToken) {
      return reply.status(401).send({ error: 'Not authenticated. Login first.' });
    }

    const body = (request.body ?? {}) as {
      name?: unknown;
      trackIds?: unknown;
    };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return reply.status(400).send({ error: 'Playlist name is required.' });
    }

    const trackIds = Array.isArray(body.trackIds)
      ? body.trackIds
          .filter((trackId): trackId is string => typeof trackId === 'string')
          .map((trackId) => trackId.trim())
          .filter((trackId) => trackId.length > 0)
      : [];

    const uniqueTrackIds = Array.from(new Set(trackIds));
    if (uniqueTrackIds.length === 0) {
      return reply.status(400).send({ error: 'No tracks found for the provided selection.' });
    }

    try {
      const trackUris = uniqueTrackIds.map((trackId) => `spotify:track:${trackId}`);
      const user = await spotifyPlaylistClient.getCurrentUser(accessToken);
      const playlistId = await spotifyPlaylistClient.createPlaylist(accessToken, user.id, name);
      await spotifyPlaylistClient.addTracksToPlaylist(accessToken, playlistId, trackUris);

      return {
        playlistId,
        trackCount: trackUris.length
      };
    } catch (error) {
      console.error('[playlist] error', error);
      return reply.status(500).send({ error: 'Failed to create playlist from tracks.' });
    }
  });

  return app;
}
