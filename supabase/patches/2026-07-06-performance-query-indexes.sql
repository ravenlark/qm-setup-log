create index if not exists sessions_user_date_time_idx
  on public.sessions (user_id, session_date desc, session_time desc);

create index if not exists track_notes_user_favorite_track_idx
  on public.track_notes (user_id, is_favorite, track_id);
