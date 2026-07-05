import type { SupabaseClient } from "@supabase/supabase-js";

export type Track = {
  id: string;
  name: string;
  location: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  surface: string | null;
  length: string | null;
  track_type_id: string | null;
  is_banked: boolean;
  is_system: boolean;
  created_by: string | null;
  archived_at: string | null;
};

export type TrackNotes = {
  id: string;
  user_id: string;
  track_id: string;
  layout_notes: string | null;
  line_notes: string | null;
  surface_notes: string | null;
  tire_notes: string | null;
  facility_notes: string | null;
  notes: string | null;
  is_favorite: boolean;
};

export type TrackWithNotes = Track & {
  is_favorite: boolean;
  notesRecord: TrackNotes | null;
};

export type TrackInput = {
  name: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  surface: string;
  length: string;
  track_type_id: string;
  is_banked: boolean;
};

export type TrackType = {
  id: string;
  name: string;
};

export type TrackNotesInput = {
  layout_notes: string;
  line_notes: string;
  surface_notes: string;
  tire_notes: string;
  facility_notes: string;
  notes: string;
};

export type TrackCatalogPage = {
  tracks: TrackWithNotes[];
  hasMore: boolean;
};

const trackSelect =
  "id, name, location, street_address, city, state, postal_code, country, surface, length, track_type_id, is_banked, is_system, created_by, archived_at";

const notesSelect =
  "id, user_id, track_id, layout_notes, line_notes, surface_notes, tire_notes, facility_notes, notes, is_favorite";

const idFetchChunkSize = 100;
const notesFetchPageSize = 1000;

export async function fetchUserTracks(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrackWithNotes[]> {
  const notesByTrackId = await fetchUserTrackNotesByTrackId(supabase, userId);
  const favoriteTrackIds = Array.from(notesByTrackId.values())
    .filter((note) => note.is_favorite)
    .map((note) => note.track_id);

  let query = supabase
    .from("tracks")
    .select(trackSelect)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (favoriteTrackIds.length) {
    query = query.or(
      `created_by.eq.${userId},id.in.(${favoriteTrackIds.join(",")})`,
    );
  } else {
    query = query.eq("created_by", userId);
  }

  const { data: tracks, error: tracksError } = await query;

  if (tracksError) throw tracksError;

  return (tracks ?? [])
    .map((track) => trackWithNotes(track as Track, notesByTrackId))
    .filter((track) => !track.is_system || track.is_favorite)
    .sort(sortTracksByName);
}

export async function fetchTracksByIds(
  supabase: SupabaseClient,
  userId: string,
  trackIds: string[],
  options: { includeArchived?: boolean } = {},
): Promise<TrackWithNotes[]> {
  const uniqueTrackIds = Array.from(new Set(trackIds.filter(Boolean)));
  if (!uniqueTrackIds.length) return [];

  const [tracks, notesByTrackId] = await Promise.all([
    fetchTrackRowsByIds(supabase, uniqueTrackIds),
    fetchUserTrackNotesByTrackId(supabase, userId),
  ]);

  return tracks
    .map((track) => trackWithNotes(track, notesByTrackId))
    .filter((track) => options.includeArchived || !track.archived_at)
    .sort(sortTracksByName);
}

export async function fetchTrackCatalog(
  supabase: SupabaseClient,
  userId: string,
  options: { search?: string; from?: number; to?: number; pageSize?: number } = {},
): Promise<TrackCatalogPage> {
  const pageSize = options.pageSize ?? 50;
  const from = options.from ?? 0;
  const to = options.to ?? from + pageSize - 1;
  const search = cleanSearchTerm(options.search ?? "");
  const fetchTo = to + 1;

  let query = supabase
    .from("tracks")
    .select(trackSelect)
    .eq("is_system", true)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .range(from, fetchTo);

  if (search) {
    const pattern = `*${search}*`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `city.ilike.${pattern}`,
        `state.ilike.${pattern}`,
        `location.ilike.${pattern}`,
        `postal_code.ilike.${pattern}`,
        `surface.ilike.${pattern}`,
        `length.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data: catalogTracks, error: tracksError } = await query;

  if (tracksError) throw tracksError;

  const requestedTracks = (catalogTracks ?? []) as Track[];
  const tracks = requestedTracks.slice(0, pageSize);
  const hasMore = requestedTracks.length > pageSize;

  if (!tracks.length) {
    return { tracks: [], hasMore: false };
  }

  const { data: notes, error: notesError } = await supabase
    .from("track_notes")
    .select(notesSelect)
    .eq("user_id", userId)
    .in(
      "track_id",
      tracks.map((track) => track.id),
    );

  if (notesError) throw notesError;

  const notesByTrackId = new Map(
    (notes ?? []).map((note) => [note.track_id, note as TrackNotes]),
  );

  return {
    hasMore,
    tracks: tracks.map((track) => trackWithNotes(track, notesByTrackId)),
  };
}

export async function fetchTrackTypes(
  supabase: SupabaseClient,
): Promise<TrackType[]> {
  const { data, error } = await supabase
    .from("track_types")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TrackType[];
}

export async function createPrivateTrack(
  supabase: SupabaseClient,
  userId: string,
  input: TrackInput,
): Promise<Track> {
  const { data, error } = await supabase
    .from("tracks")
    .insert({
      name: input.name.trim(),
      location: formatLocation(input),
      street_address: cleanOptional(input.street_address),
      city: cleanOptional(input.city),
      state: cleanOptional(input.state),
      postal_code: cleanOptional(input.postal_code),
      country: cleanOptional(input.country) ?? "US",
      surface: cleanOptional(input.surface),
      length: cleanOptional(input.length),
      track_type_id: cleanOptional(input.track_type_id),
      is_banked: input.is_banked,
      is_system: false,
      created_by: userId,
    })
    .select(trackSelect)
    .single();

  if (error) throw error;
  return data as Track;
}

export async function updatePrivateTrack(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
  input: TrackInput,
): Promise<Track> {
  const { data, error } = await supabase
    .from("tracks")
    .update({
      name: input.name.trim(),
      location: formatLocation(input),
      street_address: cleanOptional(input.street_address),
      city: cleanOptional(input.city),
      state: cleanOptional(input.state),
      postal_code: cleanOptional(input.postal_code),
      country: cleanOptional(input.country) ?? "US",
      surface: cleanOptional(input.surface),
      length: cleanOptional(input.length),
      track_type_id: cleanOptional(input.track_type_id),
      is_banked: input.is_banked,
    })
    .eq("id", trackId)
    .eq("created_by", userId)
    .eq("is_system", false)
    .select(trackSelect)
    .single();

  if (error) throw error;
  return data as Track;
}

export async function saveTrackNotes(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
  input: TrackNotesInput,
): Promise<TrackNotes> {
  const { data, error } = await supabase
    .from("track_notes")
    .upsert(
      {
        user_id: userId,
        track_id: trackId,
        layout_notes: cleanOptional(input.layout_notes),
        line_notes: cleanOptional(input.line_notes),
        surface_notes: cleanOptional(input.surface_notes),
        tire_notes: cleanOptional(input.tire_notes),
        facility_notes: cleanOptional(input.facility_notes),
        notes: cleanOptional(input.notes),
      },
      { onConflict: "user_id,track_id" },
    )
    .select(notesSelect)
    .single();

  if (error) throw error;
  return data as TrackNotes;
}

export async function setTrackFavorite(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
  isFavorite: boolean,
): Promise<TrackNotes> {
  const { data, error } = await supabase
    .from("track_notes")
    .upsert(
      {
        user_id: userId,
        track_id: trackId,
        is_favorite: isFavorite,
      },
      { onConflict: "user_id,track_id" },
    )
    .select(notesSelect)
    .single();

  if (error) throw error;
  return data as TrackNotes;
}

export async function removePrivateTrack(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
): Promise<"archived" | "deleted"> {
  const { count, error: countError } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("track_id", trackId);

  if (countError) throw countError;

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("tracks")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", trackId)
      .eq("created_by", userId)
      .eq("is_system", false);

    if (error) throw error;
    return "archived";
  }

  const { error } = await supabase
    .from("tracks")
    .delete()
    .eq("id", trackId)
    .eq("created_by", userId)
    .eq("is_system", false);

  if (error) throw error;
  return "deleted";
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanSearchTerm(value: string) {
  return value.trim().replace(/[,%]/g, " ").replace(/\s+/g, " ");
}

async function fetchTrackRowsByIds(
  supabase: SupabaseClient,
  trackIds: string[],
): Promise<Track[]> {
  const tracks: Track[] = [];

  for (let index = 0; index < trackIds.length; index += idFetchChunkSize) {
    const chunk = trackIds.slice(index, index + idFetchChunkSize);
    const { data, error } = await supabase
      .from("tracks")
      .select(trackSelect)
      .in("id", chunk);

    if (error) throw error;
    tracks.push(...((data ?? []) as Track[]));
  }

  return tracks;
}

async function fetchUserTrackNotesByTrackId(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, TrackNotes>> {
  const notes: TrackNotes[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("track_notes")
      .select(notesSelect)
      .eq("user_id", userId)
      .range(from, from + notesFetchPageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as TrackNotes[];
    notes.push(...page);

    if (page.length < notesFetchPageSize) break;
    from += notesFetchPageSize;
  }

  return new Map(notes.map((note) => [note.track_id, note]));
}

function trackWithNotes(
  track: Track,
  notesByTrackId: Map<string, TrackNotes>,
): TrackWithNotes {
  const notesRecord = notesByTrackId.get(track.id) ?? null;
  return {
    ...track,
    is_favorite: notesRecord?.is_favorite ?? false,
    notesRecord,
  };
}

function formatLocation(input: TrackInput): string | null {
  const city = input.city.trim();
  const state = input.state.trim();
  return [city, state].filter(Boolean).join(", ") || null;
}

function sortTracksByName(a: TrackWithNotes, b: TrackWithNotes) {
  return a.name.localeCompare(b.name);
}
