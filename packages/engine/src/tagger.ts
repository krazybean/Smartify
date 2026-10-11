export type TaggerTrack = {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
};

export type TaggerAudioFeatures = {
  tempo: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
};

export const ALLOWED_GENERATED_TAGS = [
  'slow',
  'medium',
  'fast',
  'low_energy',
  'medium_energy',
  'high_energy',
  'sad',
  'happy',
  'danceable'
] as const;

type AllowedGeneratedTag = (typeof ALLOWED_GENERATED_TAGS)[number];

function normalizeGeneratedTag(tag: AllowedGeneratedTag): AllowedGeneratedTag {
  return tag.toLowerCase().replace(/\s+/g, '_') as AllowedGeneratedTag;
}

export function generateTagsForTrack(
  _track: TaggerTrack,
  audioFeatures: TaggerAudioFeatures
): string[] {
  const tags: AllowedGeneratedTag[] = [];

  if (audioFeatures.tempo !== null) {
    if (audioFeatures.tempo < 90) {
      tags.push(normalizeGeneratedTag('slow'));
    } else if (audioFeatures.tempo <= 120) {
      tags.push(normalizeGeneratedTag('medium'));
    } else {
      tags.push(normalizeGeneratedTag('fast'));
    }
  }

  if (audioFeatures.energy !== null) {
    if (audioFeatures.energy < 0.4) {
      tags.push(normalizeGeneratedTag('low_energy'));
    } else if (audioFeatures.energy <= 0.7) {
      tags.push(normalizeGeneratedTag('medium_energy'));
    } else {
      tags.push(normalizeGeneratedTag('high_energy'));
    }
  }

  if (audioFeatures.valence !== null) {
    if (audioFeatures.valence < 0.3) {
      tags.push(normalizeGeneratedTag('sad'));
    }

    if (audioFeatures.valence > 0.7) {
      tags.push(normalizeGeneratedTag('happy'));
    }
  }

  if (audioFeatures.danceability !== null && audioFeatures.danceability > 0.7) {
    tags.push(normalizeGeneratedTag('danceable'));
  }

  return tags;
}
