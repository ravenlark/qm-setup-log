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
  is_banked: boolean;
};

export type TrackNotesInput = {
  layout_notes: string;
  line_notes: string;
  surface_notes: string;
  tire_notes: string;
  facility_notes: string;
  notes: string;
};

const trackSelect =
  "id, name, location, street_address, city, state, postal_code, country, surface, length, is_banked, is_system, created_by, archived_at";

const notesSelect =
  "id, user_id, track_id, layout_notes, line_notes, surface_notes, tire_notes, facility_notes, notes, is_favorite";

export async function fetchTracks(
  supabase: SupabaseClient,
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<TrackWithNotes[]> {
  const { data: tracks, error: tracksError } = await supabase
    .from("tracks")
    .select(trackSelect)
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (tracksError) throw tracksError;

  const { data: notes, error: notesError } = await supabase
    .from("track_notes")
    .select(notesSelect)
    .eq("user_id", userId);

  if (notesError) throw notesError;

  const notesByTrackId = new Map(
    (notes ?? []).map((note) => [note.track_id, note as TrackNotes]),
  );

  return (tracks ?? [])
    .map((track) => {
      const notesRecord = notesByTrackId.get(track.id) ?? null;
      return {
        ...(track as Track),
        is_favorite: notesRecord?.is_favorite ?? false,
        notesRecord,
      };
    })
    .filter((track) => options.includeArchived || !track.archived_at);
}

export async function fetchUserTracks(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrackWithNotes[]> {
  const tracks = await fetchTracks(supabase, userId);
  return tracks
    .filter((track) =>
      track.is_system ? track.is_favorite : track.created_by === userId,
    )
    .sort(sortTracksByName);
}

export async function fetchTrackCatalog(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrackWithNotes[]> {
  const tracks = await fetchTracks(supabase, userId);
  return tracks.filter((track) => track.is_system).sort(sortTracksByName);
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

function formatLocation(input: TrackInput): string | null {
  const city = input.city.trim();
  const state = input.state.trim();
  return [city, state].filter(Boolean).join(", ") || null;
}

function sortTracksByName(a: TrackWithNotes, b: TrackWithNotes) {
  return a.name.localeCompare(b.name);
}
