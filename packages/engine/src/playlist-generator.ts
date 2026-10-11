import { getTracksByFilters, type TrackFilters } from '@smartify/db';

export type PlaylistGenerationOptions = {
  name: string;
  limit?: number;
};

export type GeneratedPlaylist = {
  name: string;
  trackUris: string[];
};

export function generatePlaylistFromFilters(
  filters: TrackFilters,
  options: PlaylistGenerationOptions
): GeneratedPlaylist {
  const limit = options.limit ?? 50;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;

  const tracks = getTracksByFilters(filters);
  const limitedTracks = tracks.slice(0, safeLimit);

  const trackUris = Array.from(new Set(limitedTracks.map((track) => `spotify:track:${track.id}`)));

  return {
    name: options.name,
    trackUris
  };
}
