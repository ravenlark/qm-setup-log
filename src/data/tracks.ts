import type { SupabaseClient } from "@supabase/supabase-js";

export type Track = {
  id: string;
  name: string;
  location: string | null;
  surface: string | null;
  length: string | null;
  is_banked: boolean;
  is_system: boolean;
  created_by: string | null;
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
};

export type TrackWithNotes = Track & {
  notesRecord: TrackNotes | null;
};

export type TrackInput = {
  name: string;
  location: string;
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

export async function fetchTracks(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrackWithNotes[]> {
  const { data: tracks, error: tracksError } = await supabase
    .from("tracks")
    .select("id, name, location, surface, length, is_banked, is_system, created_by")
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (tracksError) throw tracksError;

  const { data: notes, error: notesError } = await supabase
    .from("track_notes")
    .select(
      "id, user_id, track_id, layout_notes, line_notes, surface_notes, tire_notes, facility_notes, notes",
    )
    .eq("user_id", userId);

  if (notesError) throw notesError;

  const notesByTrackId = new Map(
    (notes ?? []).map((note) => [note.track_id, note as TrackNotes]),
  );

  return (tracks ?? []).map((track) => ({
    ...(track as Track),
    notesRecord: notesByTrackId.get(track.id) ?? null,
  }));
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
      location: cleanOptional(input.location),
      surface: cleanOptional(input.surface),
      length: cleanOptional(input.length),
      is_banked: input.is_banked,
      is_system: false,
      created_by: userId,
    })
    .select("id, name, location, surface, length, is_banked, is_system, created_by")
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
      location: cleanOptional(input.location),
      surface: cleanOptional(input.surface),
      length: cleanOptional(input.length),
      is_banked: input.is_banked,
    })
    .eq("id", trackId)
    .eq("created_by", userId)
    .eq("is_system", false)
    .select("id, name, location, surface, length, is_banked, is_system, created_by")
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
    .select(
      "id, user_id, track_id, layout_notes, line_notes, surface_notes, tire_notes, facility_notes, notes",
    )
    .single();

  if (error) throw error;
  return data as TrackNotes;
}

export async function deletePrivateTrack(
  supabase: SupabaseClient,
  userId: string,
  trackId: string,
): Promise<void> {
  const { error } = await supabase
    .from("tracks")
    .delete()
    .eq("id", trackId)
    .eq("created_by", userId)
    .eq("is_system", false);

  if (error) throw error;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
