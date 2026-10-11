'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Track = {
  id: string;
  name: string;
  artist_name: string;
  preview_url?: string | null;
  playlists?: Array<{ id: string; name: string }>;
  playlist_count?: number;
  tags?: string[];
};

type TagItem = {
  tag: string;
  count: number;
};

type PlaylistSummary = {
  id: string;
  name: string;
  trackCount: number;
};

type WorkspaceList = {
  id: string;
  name: string;
  tracks: Track[];
};

type WorkspaceTrackDragData = {
  type: 'workspace-track';
  track: Track;
  listId: string;
};

type LibraryTrackDragData = {
  type: 'library-track';
  track: Track;
};
type AuthMeResponse = {
  isAuthenticated: boolean;
  user?: {
    name?: string;
    email?: string;
  };
};

type Filters = {
  tempo_min: string;
  tempo_max: string;
  energy_min: string;
  energy_max: string;
  valence_min: string;
  valence_max: string;
};
type ActiveFilterMode = 'tags' | 'playlist' | 'none';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TAG_GROUPS: Array<{ title: string; tags: string[] }> = [
  {
    title: 'Energy',
    tags: ['low_energy', 'medium_energy', 'high_energy']
  },
  {
    title: 'Tempo',
    tags: ['slow', 'medium', 'fast']
  },
  {
    title: 'Mood',
    tags: ['sad', 'happy']
  },
  {
    title: 'Movement',
    tags: ['danceable']
  }
];

const TAG_DESCRIPTIONS: Record<string, string> = {
  low_energy: 'Soft and calm tracks',
  medium_energy: 'Balanced energy and momentum',
  high_energy: 'Fast, intense tracks',
  slow: 'Lower tempo tracks',
  medium: 'Moderate tempo tracks',
  fast: 'Higher tempo tracks',
  sad: 'More introspective or low-valence tracks',
  happy: 'More uplifting or high-valence tracks',
  danceable: 'Strong dance groove and movement'
};

const QUICK_FILTERS: Array<{ label: string; tags: string[] }> = [
  { label: 'Gym', tags: ['high_energy', 'danceable'] },
  { label: 'Chill', tags: ['low_energy', 'slow'] },
  { label: 'Focus', tags: ['medium_energy', 'medium'] }
];
const TRACK_SKELETON_COUNT = 6;
const NO_PLAYLIST_SELECTED_MESSAGE = 'Select a playlist to explore your music';
const DEFAULT_WORKSPACE_LIST_ID = 'default';

function createWorkspaceListId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `list-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function formatLastSyncedLabel(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) {
    return 'Never synced';
  }

  const syncTime = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(syncTime)) {
    return 'Never synced';
  }

  const diffMs = Date.now() - syncTime;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'Last synced: just now';
  }

  if (diffMinutes === 1) {
    return 'Last synced: 1 minute ago';
  }

  return `Last synced: ${diffMinutes} minutes ago`;
}

function formatTagLabel(tag: string): string {
  return tag
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function LibraryTrackDragHandle({ track }: { track: Track }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-track-${track.id}`,
    data: {
      type: 'library-track',
      track
    } satisfies LibraryTrackDragData
  });

  return (
    <button
      aria-label={`Drag ${track.name?.trim() ? track.name : 'Unknown Track'} to workspace`}
      className={`h-7 w-7 rounded border border-slate-300 bg-slate-50 text-xs text-slate-600 transition hover:bg-slate-100 ${
        isDragging ? 'opacity-60' : ''
      }`}
      onClick={(event) => {
        event.stopPropagation();
      }}
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      ☰
    </button>
  );
}

function SortableWorkspaceTrackItem({
  listId,
  track,
  onRemove
}: {
  listId: string;
  track: Track;
  onRemove: (listId: string, trackId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `workspace-track-${listId}-${track.id}`,
    data: {
      type: 'workspace-track',
      listId,
      track
    } satisfies WorkspaceTrackDragData,
    transition: {
      duration: 180,
      easing: 'cubic-bezier(0.2, 0, 0, 1)'
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const safeTrackName = track.name?.trim() ? track.name : 'Unknown Track';
  const safeArtistName = track.artist_name?.trim() ? track.artist_name : 'Unknown Artist';

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm transition ${
        isDragging ? 'scale-[1.01] shadow-md' : ''
      }`}
      style={style}
    >
      <button
        aria-label={`Drag ${safeTrackName}`}
        className="cursor-grab rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-600 active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        ☰
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{safeTrackName}</p>
        <p className="truncate text-xs text-slate-500">{safeArtistName}</p>
      </div>
      <button
        className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
        onClick={() => onRemove(listId, track.id)}
        type="button"
      >
        Remove
      </button>
    </li>
  );
}

function WorkspaceListColumn({
  list,
  isActive,
  isDropTarget,
  isFlashHighlighted,
  isCreatingPlaylist,
  message,
  onActivate,
  onRename,
  onDelete,
  onClear,
  onCreatePlaylist,
  onRemoveTrack
}: {
  list: WorkspaceList;
  isActive: boolean;
  isDropTarget: boolean;
  isFlashHighlighted: boolean;
  isCreatingPlaylist: boolean;
  message: string;
  onActivate: (listId: string) => void;
  onRename: (listId: string, name: string) => void;
  onDelete: (listId: string) => void;
  onClear: (listId: string) => void;
  onCreatePlaylist: (listId: string) => void;
  onRemoveTrack: (listId: string, trackId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `list-${list.id}`,
    data: {
      type: 'workspace-list',
      listId: list.id
    }
  });

  const isHighlighted = isDropTarget || isOver || isFlashHighlighted;
  const isDefault = list.id === DEFAULT_WORKSPACE_LIST_ID;

  return (
    <div
      className={`w-72 shrink-0 rounded-lg border bg-white p-3 transition-colors duration-200 ${
        isHighlighted
          ? 'border-emerald-500 bg-emerald-50'
          : isActive
            ? 'border-emerald-300 ring-1 ring-emerald-100'
            : 'border-slate-200'
      }`}
      onClick={() => onActivate(list.id)}
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(list.id);
        }
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <input
          aria-label="List name"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900"
          onChange={(event) => onRename(list.id, event.target.value)}
          onClick={(event) => event.stopPropagation()}
          value={list.name}
        />
        {!isDefault ? (
          <button
            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(list.id);
            }}
            type="button"
          >
            Delete
          </button>
        ) : null}
      </div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{list.tracks.length} track(s)</p>
        {isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Active
          </span>
        ) : null}
      </div>
      <div className="mb-3 flex items-center gap-2">
        <button
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
          onClick={(event) => {
            event.stopPropagation();
            onClear(list.id);
          }}
          type="button"
        >
          Clear
        </button>
        <button
          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCreatingPlaylist || list.tracks.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            onCreatePlaylist(list.id);
          }}
          type="button"
        >
          {isCreatingPlaylist ? 'Creating...' : 'Create Playlist'}
        </button>
      </div>
      {message ? <p className="mb-2 text-xs text-emerald-700">{message}</p> : null}
      {list.tracks.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
          Drag tracks here or click + Add
        </p>
      ) : (
        <SortableContext
          items={list.tracks.map((track) => `workspace-track-${list.id}-${track.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="max-h-[20rem] space-y-2 overflow-auto">
            {list.tracks.map((track) => (
              <SortableWorkspaceTrackItem
                key={`${list.id}-${track.id}`}
                listId={list.id}
                onRemove={onRemoveTrack}
                track={track}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistName, setSelectedPlaylistName] = useState<string | null>(null);
  const [activeFilterMode, setActiveFilterMode] = useState<ActiveFilterMode>('none');

  const [filters, setFilters] = useState<Filters>({
    tempo_min: '',
    tempo_max: '',
    energy_min: '',
    energy_max: '',
    valence_min: '',
    valence_max: ''
  });
  const [playlistName, setPlaylistName] = useState('Smartify Mix');
  const [accessToken, setAccessToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState<{ name?: string; email?: string } | null>(null);

  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncingLibrary, setIsSyncingLibrary] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [workspaceLists, setWorkspaceLists] = useState<WorkspaceList[]>([
    { id: DEFAULT_WORKSPACE_LIST_ID, name: 'Smartify Mix', tracks: [] }
  ]);
  const [activeListId, setActiveListId] = useState<string>(
    DEFAULT_WORKSPACE_LIST_ID
  );
  const [activeDropListId, setActiveDropListId] = useState<string | null>(null);
  const [flashListId, setFlashListId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isGeneratingPlaylist, setIsGeneratingPlaylist] = useState(false);
  const [creatingPlaylistListIds, setCreatingPlaylistListIds] = useState<string[]>([]);

  const [errorMessage, setErrorMessage] = useState('');
  const [previewMessage, setPreviewMessage] = useState('');
  const [playlistMessage, setPlaylistMessage] = useState('');
  const [workspaceMessages, setWorkspaceMessages] = useState<Record<string, string>>({});
  const [isBuilderPanelHighlighted, setIsBuilderPanelHighlighted] = useState(false);
  const [recentlyAddedTrackIds, setRecentlyAddedTrackIds] = useState<string[]>([]);
  const [cooldownTrackIds, setCooldownTrackIds] = useState<string[]>([]);
  const lastPreviewKeyRef = useRef('');
  const latestTracksRequestIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const builderHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFeedbackTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    })
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (syncPollIntervalRef.current) {
        clearInterval(syncPollIntervalRef.current);
      }
      if (builderHighlightTimeoutRef.current) {
        clearTimeout(builderHighlightTimeoutRef.current);
      }
      if (listFlashTimeoutRef.current) {
        clearTimeout(listFlashTimeoutRef.current);
      }
      addFeedbackTimeoutsRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      addFeedbackTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const tokenFromUrl = url.searchParams.get('token');
    const tokenFromStorage = window.localStorage.getItem('accessToken');

    if (tokenFromUrl && tokenFromUrl.trim().length > 0) {
      window.localStorage.setItem('accessToken', tokenFromUrl);
      setAccessToken(tokenFromUrl);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
      return;
    }

    setAccessToken(tokenFromStorage ?? '');
  }, []);

  function getAuthorizationHeaders(token: string): HeadersInit {
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`
    };
  }

  async function loadSyncStatus(): Promise<string | null> {
    if (!accessToken) {
      setLastSyncedAt(null);
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/sync/status`, {
      headers: getAuthorizationHeaders(accessToken)
    });
    const data = (await response.json()) as { lastSyncedAt?: string | null; error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? 'Failed to load sync status');
    }

    const nextValue = typeof data.lastSyncedAt === 'string' ? data.lastSyncedAt : null;
    setLastSyncedAt(nextValue);
    return nextValue;
  }

  async function loadAuthState(): Promise<void> {
    if (!accessToken) {
      setIsAuthenticated(false);
      setAuthUser(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: getAuthorizationHeaders(accessToken)
      });
      const data = (await response.json()) as AuthMeResponse;

      if (!response.ok) {
        setIsAuthenticated(false);
        setAuthUser(null);
        return;
      }

      setIsAuthenticated(Boolean(data.isAuthenticated));
      setAuthUser(data.isAuthenticated ? data.user ?? null : null);
    } catch {
      setIsAuthenticated(false);
      setAuthUser(null);
    }
  }

  useEffect(() => {
    void loadAuthState();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setIsLoadingTags(false);
      return;
    }

    async function loadTags(): Promise<void> {
      setIsLoadingTags(true);
      setErrorMessage('');

      try {
        const response = await fetch(`${API_BASE_URL}/tags`, {
          headers: getAuthorizationHeaders(accessToken)
        });
        const data = (await response.json()) as { tags?: TagItem[]; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to load tags');
        }

        setTags(Array.isArray(data.tags) ? data.tags : []);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load tags';
        setErrorMessage(message);
      } finally {
        setIsLoadingTags(false);
      }
    }

    void loadTags();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setIsLoadingLibrary(false);
      setPlaylists([]);
      setLibraryTracks([]);
      return;
    }

    async function loadLibraryContext(): Promise<void> {
      setIsLoadingLibrary(true);
      setErrorMessage('');

      try {
        const [playlistsResponse, tracksResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/playlists`, {
            headers: getAuthorizationHeaders(accessToken)
          }),
          fetch(`${API_BASE_URL}/tracks`, {
            headers: getAuthorizationHeaders(accessToken)
          })
        ]);

        const playlistsData = (await playlistsResponse.json()) as PlaylistSummary[];
        const tracksData = (await tracksResponse.json()) as { tracks?: Track[]; error?: string };

        if (!playlistsResponse.ok) {
          throw new Error('Failed to load playlists');
        }

        if (!tracksResponse.ok) {
          throw new Error(tracksData.error ?? 'Failed to load tracks');
        }

        setPlaylists(Array.isArray(playlistsData) ? playlistsData : []);
        setLibraryTracks(Array.isArray(tracksData.tracks) ? tracksData.tracks : []);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load library context';
        setErrorMessage(message);
      } finally {
        setIsLoadingLibrary(false);
      }
    }

    void loadLibraryContext();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    loadSyncStatus().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to load sync status';
      setErrorMessage(message);
    });
  }, [accessToken]);

  const filterPayload = useMemo(() => {
    const payload: {
      tags?: string[];
      playlist_id?: string;
      tempo_min?: number;
      tempo_max?: number;
      energy_min?: number;
      energy_max?: number;
      valence_min?: number;
      valence_max?: number;
    } = {};

    if (activeFilterMode === 'tags' && selectedTags.length > 0) {
      payload.tags = selectedTags;
    }

    if (activeFilterMode === 'playlist' && selectedPlaylistId) {
      payload.playlist_id = selectedPlaylistId;
    }

    const parseValue = (value: string): number | undefined => {
      if (!value.trim()) {
        return undefined;
      }
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const tempoMin = parseValue(filters.tempo_min);
    const tempoMax = parseValue(filters.tempo_max);
    const energyMin = parseValue(filters.energy_min);
    const energyMax = parseValue(filters.energy_max);
    const valenceMin = parseValue(filters.valence_min);
    const valenceMax = parseValue(filters.valence_max);

    if (tempoMin !== undefined) payload.tempo_min = tempoMin;
    if (tempoMax !== undefined) payload.tempo_max = tempoMax;
    if (energyMin !== undefined) payload.energy_min = energyMin;
    if (energyMax !== undefined) payload.energy_max = energyMax;
    if (valenceMin !== undefined) payload.valence_min = valenceMin;
    if (valenceMax !== undefined) payload.valence_max = valenceMax;

    return payload;
  }, [activeFilterMode, filters, selectedTags, selectedPlaylistId]);

  const filteredLibraryTracks = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) {
      return libraryTracks;
    }

    return libraryTracks.filter((track) => {
      const safeTrackName = track.name?.trim() ? track.name : 'Unknown Track';
      const safeArtistName = track.artist_name?.trim() ? track.artist_name : 'Unknown Artist';
      return (
        safeTrackName.toLowerCase().includes(query) ||
        safeArtistName.toLowerCase().includes(query)
      );
    });
  }, [librarySearch, libraryTracks]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [tags]);

  const groupedTags = useMemo(() => {
    const tagByName = new Map(tags.map((item) => [item.tag, item]));
    const used = new Set<string>();

    const grouped = TAG_GROUPS.map((group) => {
      const items = group.tags
        .map((tagName) => tagByName.get(tagName))
        .filter((item): item is TagItem => Boolean(item));

      items.forEach((item) => {
        used.add(item.tag);
      });

      return {
        title: group.title,
        items
      };
    }).filter((group) => group.items.length > 0);

    const others = sortedTags.filter((item) => !used.has(item.tag));
    if (others.length > 0) {
      grouped.push({
        title: 'Other',
        items: others
      });
    }

    return grouped;
  }, [tags, sortedTags]);

  const hasTagOrPlaylistSelection =
    (activeFilterMode === 'tags' && selectedTags.length > 0) ||
    (activeFilterMode === 'playlist' && Boolean(selectedPlaylistId));

  const resultsContext = useMemo(() => {
    if (activeFilterMode === 'playlist' && selectedPlaylistName) {
      return `Showing ${tracks.length} tracks from ${selectedPlaylistName}`;
    }

    if (activeFilterMode === 'tags' && selectedTags.length > 0) {
      return `Showing ${tracks.length} tracks for tags: ${selectedTags.join(', ')}`;
    }

    return `Showing ${tracks.length} tracks`;
  }, [activeFilterMode, selectedPlaylistName, selectedTags, tracks.length]);

  const filterModeLabel = useMemo(() => {
    if (activeFilterMode === 'tags') {
      return 'Filtering by: Tags';
    }
    if (activeFilterMode === 'playlist') {
      return 'Filtering by: Playlist';
    }
    return 'Filtering by: None';
  }, [activeFilterMode]);

  const activeList = useMemo(() => {
    return workspaceLists.find((list) => list.id === activeListId);
  }, [activeListId, workspaceLists]);

  const activeListTrackIds = useMemo(() => {
    return new Set((activeList?.tracks ?? []).map((track) => track.id));
  }, [activeList]);

  function getListIdFromDropTarget(dropId: string | number): string | null {
    const value = String(dropId);
    if (value.startsWith('list-')) {
      return value.slice('list-'.length);
    }
    const parts = value.split('-');
    if (parts.length >= 4 && parts[0] === 'workspace' && parts[1] === 'track') {
      return parts[2];
    }
    return null;
  }

  function getInsertionIndex(list: WorkspaceList, overId: string | number): number {
    const overListId = getListIdFromDropTarget(overId);
    if (overListId !== list.id) {
      return list.tracks.length;
    }

    const overValue = String(overId);
    if (overValue.startsWith('list-')) {
      return list.tracks.length;
    }

    const targetTrackId = overValue.split('-').slice(3).join('-');
    const targetIndex = list.tracks.findIndex((track) => track.id === targetTrackId);
    return targetIndex >= 0 ? targetIndex : list.tracks.length;
  }

  function toggleTag(tag: string): void {
    setSelectedPlaylistId(null);
    setSelectedPlaylistName(null);
    setIsLoadingTracks(true);
    setPreviewMessage('');
    setSelectedTags((previous) => {
      const next = previous.includes(tag)
        ? previous.filter((value) => value !== tag)
        : [...previous, tag];
      setActiveFilterMode(next.length > 0 ? 'tags' : 'none');
      return next;
    });
  }

  function handlePlaylistFilterClick(playlistId: string, playlistName: string): void {
    setIsLoadingTracks(true);
    setPreviewMessage('');
    setSelectedTags([]);
    setSelectedPlaylistId((previous) => {
      const nextPlaylistId = previous === playlistId ? null : playlistId;
      setActiveFilterMode(nextPlaylistId ? 'playlist' : 'none');
      setSelectedPlaylistName(nextPlaylistId ? playlistName : null);
      return nextPlaylistId;
    });
  }

  function clearFilters(): void {
    setActiveFilterMode('none');
    setSelectedTags([]);
    setSelectedPlaylistId(null);
    setSelectedPlaylistName(null);
    setTracks([]);
    setPreviewMessage(NO_PLAYLIST_SELECTED_MESSAGE);
    lastPreviewKeyRef.current = '';
  }

  function triggerBuilderHighlight(): void {
    if (builderHighlightTimeoutRef.current) {
      clearTimeout(builderHighlightTimeoutRef.current);
    }
    setIsBuilderPanelHighlighted(true);
    builderHighlightTimeoutRef.current = setTimeout(() => {
      setIsBuilderPanelHighlighted(false);
      builderHighlightTimeoutRef.current = null;
    }, 500);
  }

  function triggerListFlash(listId: string): void {
    if (listFlashTimeoutRef.current) {
      clearTimeout(listFlashTimeoutRef.current);
    }
    setFlashListId(listId);
    listFlashTimeoutRef.current = setTimeout(() => {
      setFlashListId(null);
      listFlashTimeoutRef.current = null;
    }, 250);
  }

  function markTrackJustAdded(trackId: string): void {
    setRecentlyAddedTrackIds((previous) =>
      previous.includes(trackId) ? previous : [...previous, trackId]
    );
    setCooldownTrackIds((previous) => (previous.includes(trackId) ? previous : [...previous, trackId]));

    const existingTimer = addFeedbackTimeoutsRef.current.get(trackId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      setRecentlyAddedTrackIds((previous) => previous.filter((id) => id !== trackId));
      setCooldownTrackIds((previous) => previous.filter((id) => id !== trackId));
      addFeedbackTimeoutsRef.current.delete(trackId);
    }, 900);

    addFeedbackTimeoutsRef.current.set(trackId, timer);
  }

  function addTrackToActiveList(track: Track): void {
    if (!activeList) {
      setErrorMessage('No active list selected.');
      return;
    }

    let added = false;
    const targetListId = activeList.id;
    setWorkspaceLists((previous) => {
      return previous.map((list) => {
        if (list.id !== targetListId) {
          return list;
        }
        if (list.tracks.some((item) => item.id === track.id)) {
          return list;
        }
        added = true;
        return {
          ...list,
          tracks: [...list.tracks, track]
        };
      });
    });

    if (added) {
      setWorkspaceMessages((previous) => ({
        ...previous,
        [targetListId]: `Added: ${track.name?.trim() ? track.name : 'Unknown Track'}`
      }));
      markTrackJustAdded(track.id);
      triggerListFlash(targetListId);
      triggerBuilderHighlight();
    }
  }

  function removeTrackFromList(listId: string, trackId: string): void {
    setWorkspaceLists((previous) => {
      return previous.map((list) => {
        if (list.id !== listId) {
          return list;
        }
        return {
          ...list,
          tracks: list.tracks.filter((track) => track.id !== trackId)
        };
      });
    });
    setWorkspaceMessages((previous) => ({
      ...previous,
      [listId]: 'Removed track'
    }));
  }

  function clearList(listId: string): void {
    setWorkspaceLists((previous) =>
      previous.map((list) => (list.id === listId ? { ...list, tracks: [] } : list))
    );
    setWorkspaceMessages((previous) => ({
      ...previous,
      [listId]: 'List cleared'
    }));
  }

  function addWorkspaceList(): void {
    const id = createWorkspaceListId();
    setWorkspaceLists((previous) => [
      ...previous,
      { id, name: `Playlist ${previous.length + 1}`, tracks: [] }
    ]);
    setActiveListId(id);
  }

  function renameWorkspaceList(listId: string, name: string): void {
    setWorkspaceLists((previous) =>
      previous.map((list) => (list.id === listId ? { ...list, name } : list))
    );
  }

  function deleteWorkspaceList(listId: string): void {
    if (listId === DEFAULT_WORKSPACE_LIST_ID) {
      return;
    }
    setWorkspaceLists((previous) => {
      const next = previous.filter((list) => list.id !== listId);
      return next.length > 0
        ? next
        : [{ id: DEFAULT_WORKSPACE_LIST_ID, name: 'Smartify Mix', tracks: [] }];
    });
    setWorkspaceMessages((previous) => {
      const next = { ...previous };
      delete next[listId];
      return next;
    });
    setActiveListId((previous) =>
      previous === listId ? DEFAULT_WORKSPACE_LIST_ID : previous
    );
  }

  function handleBuilderDragStart(_event: DragStartEvent): void {
    setActiveDropListId(activeListId);
  }

  function handleBuilderDragOver(event: DragOverEvent): void {
    setActiveDropListId(event.over ? getListIdFromDropTarget(event.over.id) : null);
  }

  function handleBuilderDragCancel(_event: DragCancelEvent): void {
    setActiveDropListId(null);
  }

  function handleBuilderDragEnd(event: DragEndEvent): void {
    setActiveDropListId(null);
    const { active, over } = event;
    if (!over) {
      return;
    }

    try {
      const activeData = active.data.current as WorkspaceTrackDragData | LibraryTrackDragData | undefined;
      const targetListId = getListIdFromDropTarget(over.id);
      if (!targetListId || !activeData) {
        return;
      }

      setWorkspaceLists((previous) => {
        const targetList = previous.find((list) => list.id === targetListId);
        if (!targetList) {
          return previous;
        }

        if (activeData.type === 'library-track') {
          const track = activeData.track;
          if (targetList.tracks.some((existing) => existing.id === track.id)) {
            return previous;
          }

          const nextIndex = getInsertionIndex(targetList, over.id);
          return previous.map((list) => {
            if (list.id !== targetListId) {
              return list;
            }
            const nextTracks = [...list.tracks];
            nextTracks.splice(nextIndex, 0, track);
            return { ...list, tracks: nextTracks };
          });
        }

        const sourceListId = activeData.listId;
        const sourceList = previous.find((list) => list.id === sourceListId);
        if (!sourceList) {
          return previous;
        }

        const trackId = activeData.track.id;
        const sourceIndex = sourceList.tracks.findIndex((track) => track.id === trackId);
        if (sourceIndex < 0) {
          return previous;
        }

        if (sourceListId === targetListId) {
          const computedIndex = getInsertionIndex(sourceList, over.id);
          const targetIndex = Math.max(0, Math.min(computedIndex, sourceList.tracks.length - 1));
          if (sourceIndex === targetIndex) {
            return previous;
          }
          return previous.map((list) =>
            list.id === sourceListId ? { ...list, tracks: arrayMove(list.tracks, sourceIndex, targetIndex) } : list
          );
        }

        const trackToMove = sourceList.tracks[sourceIndex];
        const dedupedTargetTracks = targetList.tracks.filter((track) => track.id !== trackToMove.id);
        const targetIndex = getInsertionIndex({ ...targetList, tracks: dedupedTargetTracks }, over.id);

        return previous.map((list) => {
          if (list.id === sourceListId) {
            return {
              ...list,
              tracks: list.tracks.filter((track) => track.id !== trackToMove.id)
            };
          }
          if (list.id === targetListId) {
            const nextTracks = [...dedupedTargetTracks];
            nextTracks.splice(targetIndex, 0, trackToMove);
            return {
              ...list,
              tracks: nextTracks
            };
          }
          return list;
        });
      });

      setWorkspaceMessages((previous) => ({
        ...previous,
        [targetListId]: 'List updated'
      }));
      setActiveListId(targetListId);
    } catch {
      setErrorMessage('Failed to move track in workspace');
    }
  }

  function updateFilter(field: keyof Filters, value: string): void {
    setFilters((previous) => ({
      ...previous,
      [field]: value
    }));
  }

  async function togglePreviewPlayback(track: Track): Promise<void> {
    const previewUrl = track.preview_url?.trim() ? track.preview_url : null;
    if (!previewUrl) {
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => {
        setPlayingTrackId(null);
      });
    }

    const audio = audioRef.current;
    if (playingTrackId === track.id && !audio.paused) {
      audio.pause();
      setPlayingTrackId(null);
      return;
    }

    if (!audio.paused) {
      audio.pause();
    }

    if (audio.src !== previewUrl) {
      audio.src = previewUrl;
    }

    try {
      await audio.play();
      setPlayingTrackId(track.id);
    } catch {
      setPlayingTrackId(null);
    }
  }

  async function handlePreviewTracks(options?: {
    source?: 'tag' | 'manual' | 'playlist';
    filtersOverride?: typeof filterPayload;
  }): Promise<void> {
    const source = options?.source ?? 'manual';
    const payload = options?.filtersOverride ?? filterPayload;
    const hasPrimaryFilter =
      (Array.isArray(payload.tags) && payload.tags.length > 0) ||
      typeof payload.playlist_id === 'string';

    if (!hasPrimaryFilter) {
      setIsLoadingTracks(false);
      setIsPreviewLoading(false);
      setTracks([]);
      setPreviewMessage(NO_PLAYLIST_SELECTED_MESSAGE);
      return;
    }

    if (
      (source === 'tag' || source === 'playlist') &&
      (!payload.tags || payload.tags.length === 0) &&
      !payload.playlist_id
    ) {
      setTracks([]);
      setPreviewMessage(NO_PLAYLIST_SELECTED_MESSAGE);
      return;
    }

    const requestId = latestTracksRequestIdRef.current + 1;
    latestTracksRequestIdRef.current = requestId;

    setIsLoadingTracks(true);
    setIsPreviewLoading(true);
    setErrorMessage('');
    setPreviewMessage('Loading tracks...');

    try {
      const params = new URLSearchParams();
      if (payload.tags && payload.tags.length > 0) {
        params.set('tags', payload.tags.join(','));
      }
      if (payload.playlist_id) {
        params.set('playlist_id', payload.playlist_id);
      }

      const numericKeys: Array<keyof Omit<typeof filterPayload, 'tags' | 'playlist_id'>> = [
        'tempo_min',
        'tempo_max',
        'energy_min',
        'energy_max',
        'valence_min',
        'valence_max'
      ];

      for (const key of numericKeys) {
        const value = payload[key];
        if (typeof value === 'number') {
          params.set(key, String(value));
        }
      }

      const query = params.toString();
      const previewKey = query;
      if (previewKey === lastPreviewKeyRef.current) {
        if (latestTracksRequestIdRef.current === requestId) {
          setIsLoadingTracks(false);
          setIsPreviewLoading(false);
        }
        return;
      }
      lastPreviewKeyRef.current = previewKey;

      const response = await fetch(
        `${API_BASE_URL}/tracks${query.length > 0 ? `?${query}` : ''}`,
        {
          headers: getAuthorizationHeaders(accessToken)
        }
      );
      const data = (await response.json()) as { tracks?: Track[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load tracks');
      }

      if (latestTracksRequestIdRef.current !== requestId) {
        return;
      }

      const nextTracks = (Array.isArray(data.tracks) ? data.tracks : []).slice(0, 50);
      setTracks(nextTracks);
      setExpandedTrackId(null);
      setPreviewMessage(`Showing ${nextTracks.length} tracks`);
    } catch (error) {
      if (latestTracksRequestIdRef.current !== requestId) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to load tracks';
      setErrorMessage(message);
      setPreviewMessage('');
      lastPreviewKeyRef.current = '';
    } finally {
      if (latestTracksRequestIdRef.current === requestId) {
        setIsLoadingTracks(false);
        setIsPreviewLoading(false);
      }
    }
  }

  useEffect(() => {
    const payloadForPreview = {
      ...filterPayload,
      tags: activeFilterMode === 'tags' && selectedTags.length > 0 ? selectedTags : undefined,
      playlist_id:
        activeFilterMode === 'playlist' && selectedPlaylistId ? selectedPlaylistId : undefined
    };

    if (
      activeFilterMode === 'none' ||
      ((!payloadForPreview.tags || payloadForPreview.tags.length === 0) &&
        !payloadForPreview.playlist_id)
    ) {
      setIsLoadingTracks(false);
      setTracks([]);
      setPreviewMessage(NO_PLAYLIST_SELECTED_MESSAGE);
      lastPreviewKeyRef.current = '';
      return;
    }

    setIsLoadingTracks(true);
    setPreviewMessage('');

    const timer = window.setTimeout(() => {
      void handlePreviewTracks({
        source: activeFilterMode === 'playlist' ? 'playlist' : 'tag',
        filtersOverride: payloadForPreview
      });
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeFilterMode, filterPayload, selectedTags, selectedPlaylistId]);

  async function handleGeneratePlaylist(): Promise<void> {
    const cleanName = playlistName.trim();
    if (!cleanName) {
      setErrorMessage('Playlist name is required.');
      return;
    }

    setIsGeneratingPlaylist(true);
    setErrorMessage('');
    setPlaylistMessage('Generating playlist...');

    try {
      const response = await fetch(`${API_BASE_URL}/playlists/generate`, {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(accessToken),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanName,
          ...filterPayload
        })
      });

      const data = (await response.json()) as {
        playlistId?: string;
        trackCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to generate playlist');
      }

      setPlaylistMessage(`Playlist created: ${data.trackCount ?? 0} tracks`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate playlist';
      setErrorMessage(message);
      setPlaylistMessage('');
    } finally {
      setIsGeneratingPlaylist(false);
    }
  }

  async function handleCreatePlaylistFromWorkspaceList(listId: string): Promise<void> {
    const list = workspaceLists.find((item) => item.id === listId);
    if (!list) {
      return;
    }

    const cleanName = list.name.trim();
    if (!cleanName) {
      setErrorMessage('Playlist name is required.');
      return;
    }

    const uniqueTrackIds = Array.from(new Set(list.tracks.map((track) => track.id))).slice(0, 200);
    if (uniqueTrackIds.length === 0) {
      setErrorMessage('Add at least one track to this list.');
      return;
    }

    setCreatingPlaylistListIds((previous) =>
      previous.includes(listId) ? previous : [...previous, listId]
    );
    setErrorMessage('');
    setWorkspaceMessages((previous) => ({
      ...previous,
      [listId]: 'Creating playlist...'
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/playlists/create-from-tracks`, {
        method: 'POST',
        headers: {
          ...getAuthorizationHeaders(accessToken),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanName,
          trackIds: uniqueTrackIds
        })
      });

      const data = (await response.json()) as {
        playlistId?: string;
        trackCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to create playlist from list');
      }

      setWorkspaceMessages((previous) => ({
        ...previous,
        [listId]: `Playlist created: ${data.trackCount ?? uniqueTrackIds.length} tracks`
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create playlist from list';
      setErrorMessage(message);
      setWorkspaceMessages((previous) => ({
        ...previous,
        [listId]: ''
      }));
    } finally {
      setCreatingPlaylistListIds((previous) => previous.filter((id) => id !== listId));
    }
  }

  async function handleSyncLibrary(): Promise<void> {
    setIsSyncingLibrary(true);
    setErrorMessage('');

    if (syncPollIntervalRef.current) {
      clearInterval(syncPollIntervalRef.current);
      syncPollIntervalRef.current = null;
    }

    const baselineSyncTime = lastSyncedAt;

    try {
      const response = await fetch(`${API_BASE_URL}/sync`, {
        method: 'POST',
        headers: getAuthorizationHeaders(accessToken)
      });
      const data = (await response.json()) as { status?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to start sync');
      }

      const poll = async (): Promise<void> => {
        try {
          const current = await loadSyncStatus();
          const hasNewSync =
            current !== null && (baselineSyncTime === null || current !== baselineSyncTime);

          if (hasNewSync) {
            if (syncPollIntervalRef.current) {
              clearInterval(syncPollIntervalRef.current);
              syncPollIntervalRef.current = null;
            }
            setIsSyncingLibrary(false);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load sync status';
          setErrorMessage(message);
          if (syncPollIntervalRef.current) {
            clearInterval(syncPollIntervalRef.current);
            syncPollIntervalRef.current = null;
          }
          setIsSyncingLibrary(false);
        }
      };

      await poll();
      syncPollIntervalRef.current = setInterval(() => {
        void poll();
      }, 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start sync';
      setErrorMessage(message);
      setIsSyncingLibrary(false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: getAuthorizationHeaders(accessToken)
      });
    } finally {
      window.localStorage.removeItem('accessToken');
      setAccessToken('');
      setIsAuthenticated(false);
      setAuthUser(null);
      setTracks([]);
      setPlaylists([]);
      setLibraryTracks([]);
      setWorkspaceLists([{ id: DEFAULT_WORKSPACE_LIST_ID, name: 'Smartify Mix', tracks: [] }]);
      setActiveListId(DEFAULT_WORKSPACE_LIST_ID);
      window.location.reload();
    }
  }

  function handleLoginRedirect(): void {
    window.location.href = `${API_BASE_URL}/auth/login`;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Smartify Dashboard</h1>
          <p className="text-sm text-slate-600">Start with playlists, inspect tracks, and build a curated mix.</p>
          {isAuthenticated && authUser?.name ? (
            <p className="text-xs text-slate-500">Logged in as {authUser.name}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            href="/"
          >
            Home
          </a>
          {!isAuthenticated ? (
            <button
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              onClick={handleLoginRedirect}
              type="button"
            >
              Login with Spotify
            </button>
          ) : (
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              onClick={() => {
                void handleLogout();
              }}
              type="button"
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSyncingLibrary}
            onClick={() => {
              void handleSyncLibrary();
            }}
            type="button"
          >
            {isSyncingLibrary ? 'Syncing...' : 'Sync Library'}
          </button>
          <p className="text-sm text-slate-600">{formatLastSyncedLabel(lastSyncedAt)}</p>
          <p className="text-sm text-slate-500">Library tracks: {libraryTracks.length}</p>
        </div>
        {isLoadingLibrary ? <p className="mt-2 text-sm text-slate-500">Loading your library...</p> : null}
      </section>

      <DndContext
        collisionDetection={closestCenter}
        onDragCancel={handleBuilderDragCancel}
        onDragEnd={handleBuilderDragEnd}
        onDragOver={handleBuilderDragOver}
        onDragStart={handleBuilderDragStart}
        sensors={sensors}
      >
      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-3">
          <div className="lg:sticky lg:top-6 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Your Playlists</h2>
            <p className="mb-4 text-sm text-slate-500">Choose a playlist to drill into tracks and relationships.</p>
            <ul className="max-h-72 divide-y divide-slate-200 overflow-auto rounded-md border border-slate-200">
              {playlists.map((playlist) => {
                const isActive = selectedPlaylistId === playlist.id;
                return (
                  <li key={`panel-playlist-${playlist.id}`}>
                    <button
                      className={`w-full border-l-4 px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? 'border-emerald-600 bg-emerald-100 font-semibold text-emerald-900'
                          : 'border-transparent text-slate-700 hover:bg-slate-50'
                      }`}
                      onClick={() => handlePlaylistFilterClick(playlist.id, playlist.name)}
                      type="button"
                    >
                      <span className={isActive ? 'font-semibold' : 'font-medium'}>{playlist.name}</span>{' '}
                      <span className="text-slate-500">({playlist.trackCount} tracks)</span>
                    </button>
                  </li>
                );
              })}
              {playlists.length === 0 && !isLoadingLibrary ? (
                <li className="px-3 py-3 text-sm text-slate-500">No playlists synced yet.</li>
              ) : null}
            </ul>

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Track Search</h3>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => setLibrarySearch(event.target.value)}
                placeholder="Search tracks or artists"
                type="text"
                value={librarySearch}
              />
              {librarySearch.trim() ? (
                <p className="mt-2 text-xs text-slate-500">
                  {filteredLibraryTracks.length} match(es)
                  {filteredLibraryTracks.length > 100 ? ' - showing first 100 in library context.' : ''}
                </p>
              ) : null}
            </div>

            <details className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Explore by Tags (Secondary)
              </summary>
              <p className="mt-2 text-xs text-slate-500">Use tags after playlist exploration for finer filtering.</p>
              <div className="mt-3 mb-3 flex flex-wrap gap-2">
                {QUICK_FILTERS.map((quickFilter) => (
                  <button
                    key={quickFilter.label}
                    className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition-all duration-150 hover:scale-[1.02] hover:bg-slate-200"
                    onClick={() => {
                      setActiveFilterMode('tags');
                      setSelectedPlaylistId(null);
                      setSelectedPlaylistName(null);
                      setIsLoadingTracks(true);
                      setPreviewMessage('');
                      setSelectedTags(quickFilter.tags);
                    }}
                    type="button"
                  >
                    {quickFilter.label}
                  </button>
                ))}
              </div>
              {isLoadingTags ? <p className="text-sm text-slate-500">Loading tags...</p> : null}
              {!isLoadingTags && groupedTags.length === 0 ? (
                <p className="text-sm text-slate-500">No tags yet. Run a sync first.</p>
              ) : null}
              <div className="space-y-4">
                {groupedTags.map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">{group.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((tagItem) => {
                        const isSelected = selectedTags.includes(tagItem.tag);
                        return (
                          <button
                            key={tagItem.tag}
                            className={`rounded-full border px-3 py-1 text-xs transition-all duration-150 hover:scale-[1.02] ${
                              isSelected
                                ? 'border-emerald-700 bg-emerald-600 text-white shadow-sm'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              toggleTag(tagItem.tag);
                            }}
                            title={TAG_DESCRIPTIONS[tagItem.tag] ?? formatTagLabel(tagItem.tag)}
                            type="button"
                          >
                            {formatTagLabel(tagItem.tag)} ({tagItem.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </section>

        <section className="col-span-12 lg:col-span-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 border-b border-slate-200 pb-3">
              <h2 className="mb-1 text-lg font-medium text-slate-900">Tracks</h2>
              {activeFilterMode === 'playlist' && selectedPlaylistName ? (
                <p className="text-sm font-medium text-emerald-800">Viewing: {selectedPlaylistName}</p>
              ) : null}
              <p className="text-sm text-slate-600">{resultsContext}</p>
              <p className="text-xs text-slate-500">{filterModeLabel}</p>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Tempo Min
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  onChange={(event) => updateFilter('tempo_min', event.target.value)}
                  placeholder="e.g. 90"
                  type="number"
                  value={filters.tempo_min}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Tempo Max
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  onChange={(event) => updateFilter('tempo_max', event.target.value)}
                  placeholder="e.g. 120"
                  type="number"
                  value={filters.tempo_max}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Energy Min
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  max="1"
                  min="0"
                  onChange={(event) => updateFilter('energy_min', event.target.value)}
                  placeholder="e.g. 0.4"
                  step="0.01"
                  type="number"
                  value={filters.energy_min}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Energy Max
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  max="1"
                  min="0"
                  onChange={(event) => updateFilter('energy_max', event.target.value)}
                  placeholder="e.g. 0.8"
                  step="0.01"
                  type="number"
                  value={filters.energy_max}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Valence Min
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  max="1"
                  min="0"
                  onChange={(event) => updateFilter('valence_min', event.target.value)}
                  placeholder="e.g. 0.2"
                  step="0.01"
                  type="number"
                  value={filters.valence_min}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Valence Max
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  max="1"
                  min="0"
                  onChange={(event) => updateFilter('valence_max', event.target.value)}
                  placeholder="e.g. 0.7"
                  step="0.01"
                  type="number"
                  value={filters.valence_max}
                />
              </label>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPreviewLoading}
                onClick={() => {
                  void handlePreviewTracks({ source: 'manual' });
                }}
                type="button"
              >
                {isPreviewLoading ? 'Loading...' : 'Preview Tracks (Numeric Filters)'}
              </button>
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={clearFilters}
                type="button"
              >
                Clear Filters
              </button>
              {previewMessage ? <p className="text-sm text-slate-600">{previewMessage}</p> : null}
            </div>

            <div className="mb-4 flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center">
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder="Playlist name"
                type="text"
                value={playlistName}
              />
              <button
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isGeneratingPlaylist}
                onClick={() => {
                  void handleGeneratePlaylist();
                }}
                type="button"
              >
                {isGeneratingPlaylist ? 'Generating...' : 'Generate Playlist'}
              </button>
                {playlistMessage ? <p className="text-sm text-emerald-700">{playlistMessage}</p> : null}
              </div>

            {!hasTagOrPlaylistSelection ? (
              <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                {NO_PLAYLIST_SELECTED_MESSAGE}
              </div>
            ) : isLoadingTracks ? (
              <ul className="max-h-96 divide-y divide-slate-200 overflow-auto rounded-md border border-slate-200">
                {Array.from({ length: TRACK_SKELETON_COUNT }).map((_, index) => (
                  <li key={`track-skeleton-${index}`} className="px-3 py-3">
                    <div className="animate-pulse">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="h-4 w-48 rounded bg-slate-200" />
                        <div className="h-3 w-28 rounded bg-slate-200" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-16 rounded bg-slate-200" />
                        <div className="h-5 w-20 rounded-full bg-slate-200" />
                        <div className="h-5 w-24 rounded-full bg-slate-200" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="max-h-96 space-y-3 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 opacity-100 transition-opacity duration-200">
                {tracks.map((track) => {
                  const safeTrackName = track.name?.trim() ? track.name : 'Unknown Track';
                  const safeArtistName = track.artist_name?.trim() ? track.artist_name : 'Unknown Artist';
                  const trackPlaylists = Array.isArray(track.playlists) ? track.playlists : [];
                  const playlistCount = typeof track.playlist_count === 'number'
                    ? track.playlist_count
                    : trackPlaylists.length;
                  const trackTags = Array.isArray(track.tags) ? track.tags : [];
                  const hasPreview = Boolean(track.preview_url?.trim());
                  const isExpanded = expandedTrackId === track.id;
                  const isPlaying = playingTrackId === track.id;
                  const isInActiveList = activeListTrackIds.has(track.id);
                  const isJustAdded = recentlyAddedTrackIds.includes(track.id);
                  const isCoolingDown = cooldownTrackIds.includes(track.id);
                  const isAddDisabled = isInActiveList || isCoolingDown;

                  return (
                    <li
                      key={track.id}
                      className={`rounded-md border border-slate-200 bg-white px-4 py-4 text-sm transition-colors duration-200 ${
                        isExpanded ? 'bg-slate-50' : ''
                      } hover:bg-slate-50`}
                    >
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          setExpandedTrackId((previous) => (previous === track.id ? null : track.id));
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setExpandedTrackId((previous) => (previous === track.id ? null : track.id));
                          }
                        }}
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <LibraryTrackDragHandle track={track} />
                            <button
                              className={`h-7 w-7 rounded-full border text-xs ${
                                hasPreview
                                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                  : 'border-slate-300 bg-slate-100 text-slate-500 opacity-50'
                              }`}
                              disabled={!hasPreview}
                              onClick={(event) => {
                                event.stopPropagation();
                                void togglePreviewPlayback(track);
                              }}
                              type="button"
                            >
                              {isPlaying ? '⏸' : '▶'}
                            </button>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{safeTrackName}</p>
                              <p className="truncate text-xs text-slate-500">{safeArtistName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              className={`rounded border px-2 py-1 text-xs transition ${
                                isJustAdded
                                  ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                                  : isInActiveList
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                              disabled={isAddDisabled}
                              onClick={(event) => {
                                event.stopPropagation();
                                addTrackToActiveList(track);
                              }}
                              type="button"
                            >
                              {isInActiveList ? 'Added' : '+ Add'}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {trackPlaylists.length > 0 ? (
                            trackPlaylists.map((playlist) => {
                              const isActive = selectedPlaylistId === playlist.id;
                              return (
                                <button
                                  key={`${track.id}-${playlist.id}`}
                                  className={`rounded-full border px-2 py-0.5 text-xs transition ${
                                    isActive
                                      ? 'border-emerald-600 bg-emerald-600 text-white'
                                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handlePlaylistFilterClick(playlist.id, playlist.name);
                                  }}
                                  type="button"
                                >
                                  {playlist.name}
                                </button>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-400">No playlists</span>
                          )}
                        </div>
                        {playlistCount > 1 ? (
                          <p className="text-xs font-medium text-indigo-600">In multiple playlists</p>
                        ) : null}
                      </div>
                      {isExpanded ? (
                        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500">Playlists:</span>
                            {trackPlaylists.length > 0 ? (
                              trackPlaylists.map((playlist) => (
                                <span
                                  key={`expanded-${track.id}-${playlist.id}`}
                                  className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                                >
                                  {playlist.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">No playlists</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500">Tags:</span>
                            {trackTags.length > 0 ? (
                              trackTags.map((tag) => (
                                <span
                                  key={`expanded-${track.id}-tag-${tag}`}
                                  className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                >
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">No tags</span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
                {tracks.length === 0 ? (
                  <li className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                    No tracks found in this playlist
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </section>

        <section className="col-span-12">
          <div
            className={`rounded-lg border bg-white p-4 transition ${
              isBuilderPanelHighlighted
                ? 'border-emerald-400 ring-2 ring-emerald-200'
                : 'border-slate-200'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Workspace Drafts</h2>
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
                onClick={addWorkspaceList}
                type="button"
              >
                + New List
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Active list:{' '}
              <span className="font-medium text-slate-700">{activeList?.name ?? 'No active list'}</span>
            </p>
            {workspaceLists.length === 0 || !activeList ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No active list. Create a new list to continue.
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-1">
                {workspaceLists.map((list) => (
                  <WorkspaceListColumn
                    isActive={activeListId === list.id}
                    isCreatingPlaylist={creatingPlaylistListIds.includes(list.id)}
                    isDropTarget={activeDropListId === list.id}
                    isFlashHighlighted={flashListId === list.id}
                    key={list.id}
                    list={list}
                    message={workspaceMessages[list.id] ?? ''}
                    onActivate={setActiveListId}
                    onClear={clearList}
                    onCreatePlaylist={(listId) => {
                      void handleCreatePlaylistFromWorkspaceList(listId);
                    }}
                    onDelete={deleteWorkspaceList}
                    onRemoveTrack={removeTrackFromList}
                    onRename={renameWorkspaceList}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      </DndContext>
    </main>
  );
}
