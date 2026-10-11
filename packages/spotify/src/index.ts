const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

type SpotifyUser = {
  id: string;
  display_name: string | null;
  email?: string;
};

type SpotifyPlaylist = {
  id: string;
  name: string;
};

type SpotifyPlaylistTrack = {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  previewUrl: string | null;
  popularity: number | null;
};

type SpotifyAudioFeature = {
  id: string;
  tempo: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
};

type PlaylistsPage = {
  items: Array<{ id: string; name: string }>;
  next: string | null;
};

type PlaylistTracksPage = {
  items: Array<{
    track: {
      id: string | null;
      name: string;
      popularity?: number | null;
      preview_url: string | null;
      artists: Array<{ id: string; name: string }>;
    } | null;
  }>;
  next: string | null;
};

function normalizeSpotifyTrackName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  return value.length > 0 ? value : 'Unknown Track';
}

function normalizeSpotifyArtistName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  return value.length > 0 ? value : 'Unknown Artist';
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify request failed (${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

function getSpotifyAuthHeaders(accessToken: string): Record<string, string> {
  const token = accessToken?.trim();
  if (!token) {
    throw new Error('Missing access token');
  }
  console.log('token:', token.slice(0, 10));
  return {
    Authorization: `Bearer ${token}`
  };
}

export async function exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse> {
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = requiredEnv('SPOTIFY_CLIENT_SECRET');
  const redirectUri = requiredEnv('SPOTIFY_REDIRECT_URI');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  return fetchJson<SpotifyTokenResponse>(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
}

export async function getCurrentUser(accessToken: string): Promise<SpotifyUser> {
  return fetchJson<SpotifyUser>(`${SPOTIFY_API_URL}/me`, {
    headers: getSpotifyAuthHeaders(accessToken)
  });
}

export async function getUserPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const playlists: SpotifyPlaylist[] = [];
  let nextUrl: string | null = `${SPOTIFY_API_URL}/me/playlists?limit=50`;

  while (nextUrl) {
    const page: PlaylistsPage = await fetchJson<PlaylistsPage>(nextUrl, {
      headers: getSpotifyAuthHeaders(accessToken)
    });

    playlists.push(...page.items.map((item) => ({ id: item.id, name: item.name })));
    nextUrl = page.next;
  }

  return playlists;
}

export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string
): Promise<SpotifyPlaylistTrack[]> {
  const tracks: SpotifyPlaylistTrack[] = [];
  let nextUrl: string | null = `${SPOTIFY_API_URL}/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const page: PlaylistTracksPage = await fetchJson<PlaylistTracksPage>(nextUrl, {
      headers: getSpotifyAuthHeaders(accessToken)
    });

    for (const item of page.items) {
      const track = item.track;
      console.log('track:', track?.id, track?.name);
      if (!track || !track.id) {
        continue;
      }

      const artist = track.artists[0];
      const artistId = artist?.id?.trim() ? artist.id : `unknown-artist:${track.id}`;
      const artistName = normalizeSpotifyArtistName(artist?.name);
      tracks.push({
        id: track.id,
        name: normalizeSpotifyTrackName(track.name),
        artistId,
        artistName,
        previewUrl: track.preview_url,
        popularity: typeof track.popularity === 'number' ? track.popularity : null
      });
    }

    nextUrl = page.next;
  }

  return tracks;
}

export async function getAudioFeatures(
  accessToken: string,
  trackIds: string[]
): Promise<SpotifyAudioFeature[]> {
  const uniqueIds = Array.from(new Set(trackIds.filter((id) => Boolean(id && id.trim()))));
  const features: SpotifyAudioFeature[] = [];
  const authHeaders = getSpotifyAuthHeaders(accessToken);

  if (uniqueIds.length > 0) {
    await fetchJson<{ id: string | null }>(
      `${SPOTIFY_API_URL}/audio-features/${encodeURIComponent(uniqueIds[0])}`,
      {
        headers: authHeaders
      }
    );
  }

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const idsParam = batch.join(',');
    const url = `${SPOTIFY_API_URL}/audio-features?ids=${idsParam}`;
    console.log('request url:', url);

    const response = await fetchJson<{
      audio_features: Array<{
        id: string;
        tempo: number | null;
        energy: number | null;
        danceability: number | null;
        valence: number | null;
      } | null>;
    }>(url, {
      headers: authHeaders
    });

    for (const item of response.audio_features) {
      if (!item) {
        continue;
      }

      features.push({
        id: item.id,
        tempo: item.tempo,
        energy: item.energy,
        danceability: item.danceability,
        valence: item.valence
      });
    }
  }

  return features;
}

export async function createPlaylist(
  accessToken: string,
  userId: string,
  name: string
): Promise<string> {
  const response = await fetchJson<{ id: string }>(
    `${SPOTIFY_API_URL}/users/${encodeURIComponent(userId)}/playlists`,
    {
      method: 'POST',
      headers: {
        ...getSpotifyAuthHeaders(accessToken),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        public: false
      })
    }
  );

  return response.id;
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[]
): Promise<void> {
  for (let i = 0; i < trackUris.length; i += 100) {
    const batch = trackUris.slice(i, i + 100);
    await fetchJson<{ snapshot_id: string }>(
      `${SPOTIFY_API_URL}/playlists/${encodeURIComponent(playlistId)}/tracks`,
      {
        method: 'POST',
        headers: {
          ...getSpotifyAuthHeaders(accessToken),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: batch
        })
      }
    );
  }
}
