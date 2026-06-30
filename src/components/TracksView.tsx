import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MapPin, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { fetchSessions, type SetupSession } from "../data/sessions";
import {
  ACCOUNT_FEATURES,
  fetchAccountLimits,
  hasAccountFeature,
  type AccountLimits,
} from "../data/subscriptions";
import {
  createPrivateTrack,
  deletePrivateTrack,
  fetchTracks,
  saveTrackNotes,
  updatePrivateTrack,
  type TrackInput,
  type TrackNotesInput,
  type TrackWithNotes,
} from "../data/tracks";

const emptyTrackForm: TrackInput = {
  name: "",
  location: "",
  surface: "",
  length: "",
  is_banked: false,
};

const emptyNotesForm: TrackNotesInput = {
  layout_notes: "",
  line_notes: "",
  surface_notes: "",
  tire_notes: "",
  facility_notes: "",
  notes: "",
};

type TracksViewProps = {
  supabase: SupabaseClient;
  userId: string;
};

type TrackModal = "track" | "notes" | null;
type TrackFilter = "all" | "private" | "system";
type TrackStats = {
  lastSession: SetupSession | null;
  totalLaps: number;
  totalSessions: number;
};

export function TracksView({ supabase, userId }: TracksViewProps) {
  const [tracks, setTracks] = useState<TrackWithNotes[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [editingTrackId, setEditingTrackId] = useState("");
  const [notesTrackId, setNotesTrackId] = useState("");
  const [activeModal, setActiveModal] = useState<TrackModal>(null);
  const [trackForm, setTrackForm] = useState(emptyTrackForm);
  const [notesForm, setNotesForm] = useState(emptyNotesForm);
  const [trackSearch, setTrackSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [accountLimits, setAccountLimits] = useState<AccountLimits | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [message, setMessage] = useState("");

  const notesTrack = useMemo(
    () => tracks.find((track) => track.id === notesTrackId) ?? null,
    [notesTrackId, tracks],
  );

  const trackStatsByTrackId = useMemo(() => {
    const stats = new Map<string, TrackStats>();

    for (const session of sessions) {
      const current = stats.get(session.track_id) ?? {
        lastSession: null,
        totalLaps: 0,
        totalSessions: 0,
      };

      current.totalSessions += 1;
      current.totalLaps += session.total_laps ?? 0;

      if (
        !current.lastSession ||
        sessionTimestamp(session) > sessionTimestamp(current.lastSession)
      ) {
        current.lastSession = session;
      }

      stats.set(session.track_id, current);
    }

    return stats;
  }, [sessions]);

  const visibleTracks = useMemo(() => {
    const search = trackSearch.trim().toLowerCase();
    return tracks.filter((track) => {
      const matchesFilter =
        trackFilter === "all" ||
        (trackFilter === "system" && track.is_system) ||
        (trackFilter === "private" && !track.is_system);
      const matchesSearch =
        !search || searchableTrackText(track).toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [trackFilter, trackSearch, tracks]);

  const canCreateCustomTracks = hasAccountFeature(
    accountLimits,
    ACCOUNT_FEATURES.customTracks,
  );

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([
      fetchTracks(supabase, userId),
      fetchSessions(supabase),
      fetchAccountLimits(supabase),
    ])
      .then(([nextTracks, nextSessions, nextLimits]) => {
        if (!isCurrent) return;
        setTracks(nextTracks);
        setSessions(nextSessions);
        setAccountLimits(nextLimits);
        setStatus("ready");
      })
      .catch((error: Error) => {
        if (!isCurrent) return;
        setMessage(error.message);
        setStatus("ready");
      });

    return () => {
      isCurrent = false;
    };
  }, [supabase, userId]);

  function startTrackAdd() {
    if (!canCreateCustomTracks) {
      setMessage(featureMessage("custom tracks", accountLimits));
      return;
    }

    setEditingTrackId("");
    setTrackForm(emptyTrackForm);
    setNotesTrackId("");
    setNotesForm(emptyNotesForm);
    setMessage("");
    setActiveModal("track");
  }

  function startTrackEdit(track: TrackWithNotes) {
    if (track.is_system) {
      startNotesEdit(track);
      return;
    }

    setEditingTrackId(track.id);
    setTrackForm({
      name: track.name,
      location: track.location ?? "",
      surface: track.surface ?? "",
      length: track.length ?? "",
      is_banked: track.is_banked,
    });
    setMessage("");
    setActiveModal("track");
  }

  function resetTrackForm() {
    setEditingTrackId("");
    setTrackForm(emptyTrackForm);
    setNotesTrackId("");
    setNotesForm(emptyNotesForm);
    setActiveModal((current) => (current === "track" ? null : current));
  }

  function startNotesEdit(track: TrackWithNotes) {
    setNotesTrackId(track.id);
    setNotesForm(notesInputFromTrack(track));
    setMessage("");
    setActiveModal("notes");
  }

  function resetNotesForm() {
    setNotesTrackId("");
    setNotesForm(emptyNotesForm);
    setActiveModal((current) => (current === "notes" ? null : current));
  }

  async function handleSaveTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trackForm.name.trim()) {
      setMessage("Track name is required.");
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const saved = editingTrackId
        ? await updatePrivateTrack(supabase, userId, editingTrackId, trackForm)
        : await createPrivateTrack(supabase, userId, trackForm);
      const existingTrack = tracks.find((track) => track.id === saved.id);
      const savedNotes = editingTrackId
        ? existingTrack?.notesRecord ?? null
        : await saveTrackNotes(supabase, userId, saved.id, notesForm);
      setTracks((current) => {
        const withoutSaved = current.filter((track) => track.id !== saved.id);
        return [...withoutSaved, { ...saved, notesRecord: savedNotes }].sort(
          sortTracks,
        );
      });
      resetTrackForm();
      setMessage(editingTrackId ? "Track updated." : "Track added.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Track could not be saved.",
      );
    } finally {
      setStatus("ready");
    }
  }

  async function handleSaveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notesTrack) return;

    setStatus("saving");
    setMessage("");
    try {
      const savedNotes = await saveTrackNotes(
        supabase,
        userId,
        notesTrack.id,
        notesForm,
      );
      setTracks((current) =>
        current.map((track) =>
          track.id === notesTrack.id ? { ...track, notesRecord: savedNotes } : track,
        ),
      );
      resetNotesForm();
      setMessage("Track notes saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notes could not be saved.");
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteTrack(track: TrackWithNotes) {
    if (track.is_system) return;
    const confirmed = window.confirm(
      `Remove "${track.name}" and its notes? This cannot be undone.`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await deletePrivateTrack(supabase, userId, track.id);
      setTracks((current) => current.filter((item) => item.id !== track.id));
      if (editingTrackId === track.id) resetTrackForm();
      if (notesTrackId === track.id) resetNotesForm();
      setMessage("Track removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Track could not be removed.",
      );
    } finally {
      setStatus("ready");
    }
  }

  return (
    <section className="track-card-layout">
      <div className="panel track-list-panel">
        <div className="panel-header">
          <div>
            <h2>Tracks</h2>
          </div>
          <div className="panel-actions">
            <span className="count-pill">{tracks.length}</span>
            <button
              aria-label="Add track"
              className="icon-button"
              disabled={status === "saving" || !canCreateCustomTracks}
              type="button"
              onClick={startTrackAdd}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {accountLimits && !canCreateCustomTracks ? (
          <div className="limit-notice">
            {featureMessage("custom tracks", accountLimits)}
          </div>
        ) : null}

        <div className="track-list-controls">
          <input
            aria-label="Search tracks"
            type="search"
            value={trackSearch}
            placeholder="Search tracks"
            onChange={(event) => setTrackSearch(event.target.value)}
          />
          <select
            aria-label="Filter tracks"
            value={trackFilter}
            onChange={(event) => setTrackFilter(event.target.value as TrackFilter)}
          >
            <option value="all">All tracks</option>
            <option value="private">My tracks</option>
            <option value="system">System tracks</option>
          </select>
        </div>

        {status === "loading" ? (
          <div className="empty-state">Loading tracks...</div>
        ) : visibleTracks.length ? (
          <div className="track-card-grid">
            {visibleTracks.map((track) => (
              <TrackCard
                key={track.id}
                stats={trackStatsByTrackId.get(track.id)}
                status={status}
                track={track}
                onDelete={handleDeleteTrack}
                onEdit={startTrackEdit}
                onNotes={startNotesEdit}
              />
            ))}
          </div>
        ) : tracks.length ? (
          <div className="empty-state">No tracks match your search.</div>
        ) : (
          <div className="empty-state">No tracks yet.</div>
        )}
      </div>

      {message ? <div className="inline-message garage-message">{message}</div> : null}

      {activeModal === "track" ? (
        <Modal
          eyebrow={editingTrackId ? "Edit Track" : "Private Track"}
          icon={<MapPin size={20} />}
          title={editingTrackId ? trackForm.name || "Track" : "Add Track"}
          onClose={resetTrackForm}
        >
          <form onSubmit={handleSaveTrack}>
            <div className="form-grid">
              <label>
                Name
                <input
                  required
                  value={trackForm.name}
                  onChange={(event) =>
                    setTrackForm({ ...trackForm, name: event.target.value })
                  }
                  placeholder="Blue Mountain"
                />
              </label>
              <label>
                Location
                <input
                  value={trackForm.location}
                  onChange={(event) =>
                    setTrackForm({ ...trackForm, location: event.target.value })
                  }
                  placeholder="City, State"
                />
              </label>
              <label>
                Surface
                <input
                  value={trackForm.surface}
                  onChange={(event) =>
                    setTrackForm({ ...trackForm, surface: event.target.value })
                  }
                  placeholder="Dirt, asphalt, concrete"
                />
              </label>
              <label>
                Length
                <input
                  value={trackForm.length}
                  onChange={(event) =>
                    setTrackForm({ ...trackForm, length: event.target.value })
                  }
                  placeholder="1/20 mile"
                />
              </label>
            </div>
            <div className="radio-field track-shape-field">
              <span>Track Shape</span>
              <div
                aria-label="Track shape"
                className="segmented-radio two-options"
                role="radiogroup"
              >
                <label>
                  <input
                    checked={trackForm.is_banked}
                    name="track_shape"
                    type="radio"
                    value="banked"
                    onChange={() => setTrackForm({ ...trackForm, is_banked: true })}
                  />
                  <span>Banked Track</span>
                </label>
                <label>
                  <input
                    checked={!trackForm.is_banked}
                    name="track_shape"
                    type="radio"
                    value="flat"
                    onChange={() => setTrackForm({ ...trackForm, is_banked: false })}
                  />
                  <span>Flat Track</span>
                </label>
              </div>
            </div>
            {!editingTrackId ? (
              <div className="form-grid notes-grid">
                <label>
                  Layout Notes
                  <textarea
                    value={notesForm.layout_notes}
                    onChange={(event) =>
                      setNotesForm({
                        ...notesForm,
                        layout_notes: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Racing Line Notes
                  <textarea
                    value={notesForm.line_notes}
                    onChange={(event) =>
                      setNotesForm({ ...notesForm, line_notes: event.target.value })
                    }
                  />
                </label>
                <label>
                  Surface Evolution
                  <textarea
                    value={notesForm.surface_notes}
                    onChange={(event) =>
                      setNotesForm({
                        ...notesForm,
                        surface_notes: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Tire / Stagger Notes
                  <textarea
                    value={notesForm.tire_notes}
                    onChange={(event) =>
                      setNotesForm({ ...notesForm, tire_notes: event.target.value })
                    }
                  />
                </label>
                <label>
                  Facility Notes
                  <textarea
                    value={notesForm.facility_notes}
                    onChange={(event) =>
                      setNotesForm({
                        ...notesForm,
                        facility_notes: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  General Notes
                  <textarea
                    value={notesForm.notes}
                    onChange={(event) =>
                      setNotesForm({ ...notesForm, notes: event.target.value })
                    }
                  />
                </label>
              </div>
            ) : null}
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={resetTrackForm}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={status === "saving"}
                type="submit"
              >
                {editingTrackId ? <Save size={18} /> : <Plus size={18} />}
                {editingTrackId ? "Save Track" : "Add Track"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === "notes" ? (
        <Modal
          eyebrow="Track Notes"
          icon={<MapPin size={20} />}
          title={notesTrack?.name ?? "Track Notes"}
          onClose={resetNotesForm}
        >
          <form onSubmit={handleSaveNotes}>
            <div className="form-grid notes-grid">
              <label>
                Layout Notes
                <textarea
                  value={notesForm.layout_notes}
                  onChange={(event) =>
                    setNotesForm({
                      ...notesForm,
                      layout_notes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Racing Line Notes
                <textarea
                  value={notesForm.line_notes}
                  onChange={(event) =>
                    setNotesForm({ ...notesForm, line_notes: event.target.value })
                  }
                />
              </label>
              <label>
                Surface Evolution
                <textarea
                  value={notesForm.surface_notes}
                  onChange={(event) =>
                    setNotesForm({
                      ...notesForm,
                      surface_notes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Tire / Stagger Notes
                <textarea
                  value={notesForm.tire_notes}
                  onChange={(event) =>
                    setNotesForm({ ...notesForm, tire_notes: event.target.value })
                  }
                />
              </label>
              <label>
                Facility Notes
                <textarea
                  value={notesForm.facility_notes}
                  onChange={(event) =>
                    setNotesForm({
                      ...notesForm,
                      facility_notes: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                General Notes
                <textarea
                  value={notesForm.notes}
                  onChange={(event) =>
                    setNotesForm({ ...notesForm, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={resetNotesForm}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={status === "saving"}
                type="submit"
              >
                <Save size={18} />
                Save Notes
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function TrackCard({
  onDelete,
  onEdit,
  onNotes,
  stats,
  status,
  track,
}: {
  onDelete: (track: TrackWithNotes) => void;
  onEdit: (track: TrackWithNotes) => void;
  onNotes: (track: TrackWithNotes) => void;
  stats: TrackStats | undefined;
  status: "loading" | "ready" | "saving";
  track: TrackWithNotes;
}) {
  const notes = track.notesRecord;
  const noteLines = [
    { label: "Layout", value: notes?.layout_notes },
    { label: "Line", value: notes?.line_notes },
    { label: "Surface", value: notes?.surface_notes },
    { label: "Tires/Stagger", value: notes?.tire_notes },
    { label: "Facility", value: notes?.facility_notes },
    { label: "Notes", value: notes?.notes },
  ].filter((note) => Boolean(note.value?.trim()));

  return (
    <article
      className={`garage-card track-card ${
        track.is_system ? "track-card-system" : "track-card-user"
      }`}
    >
      <div className="garage-card-heading">
        <div>
          <h3>{track.name}</h3>
          <p>{trackSummary(track)}</p>
        </div>
        {!track.is_system ? (
            <span className="garage-kind">Your Track</span>
          ) : null}
      </div>

      <div className="garage-stat-grid track-stat-grid">
        <TrackStat label="Total Sessions" value={String(stats?.totalSessions ?? 0)} />
        <TrackStat
          label="Last Session"
          value={stats?.lastSession ? formatShortDate(stats.lastSession) : "--"}
        />
        <TrackStat label="Total Laps" value={String(stats?.totalLaps ?? 0)} />
      </div>

      {noteLines.length ? (
        <div className="track-card-notes">
          {noteLines.map((note) => (
            <NoteLine key={note.label} label={note.label} value={note.value} />
          ))}
        </div>
      ) : null}

      <div className="garage-card-actions">
        {!track.is_system ? (
          <button
            aria-label={`Edit ${track.name}`}
            className="icon-button"
            disabled={status === "saving"}
            type="button"
            onClick={() => onEdit(track)}
          >
            <Pencil size={18} />
          </button>
        ) : null}
        <button
          aria-label={`Edit notes for ${track.name}`}
          className="secondary-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onNotes(track)}
        >
          Notes
        </button>
        {!track.is_system ? (
          <button
            aria-label={`Remove ${track.name}`}
            className="danger-icon-button"
            disabled={status === "saving"}
            type="button"
            onClick={() => onDelete(track)}
          >
            <Trash2 size={18} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TrackStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="garage-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NoteLine({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

function Modal({
  children,
  eyebrow,
  icon,
  onClose,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  icon: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="modal-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <div className="panel-actions">
            {icon}
            <button
              aria-label="Close dialog"
              className="icon-button"
              type="button"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

function sortTracks(a: TrackWithNotes, b: TrackWithNotes) {
  return Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name);
}

function notesInputFromTrack(track: TrackWithNotes): TrackNotesInput {
  const notes = track.notesRecord;
  return {
    layout_notes: notes?.layout_notes ?? "",
    line_notes: notes?.line_notes ?? "",
    surface_notes: notes?.surface_notes ?? "",
    tire_notes: notes?.tire_notes ?? "",
    facility_notes: notes?.facility_notes ?? "",
    notes: notes?.notes ?? "",
  };
}

function trackSummary(track: TrackWithNotes) {
  return [
    track.location,
    track.surface,
    track.length,
    track.is_banked ? "Banked" : "Flat",
  ]
    .filter(Boolean)
    .join(" - ");
}

function sessionTimestamp(session: SetupSession) {
  return `${session.session_date}T${session.session_time ?? "00:00"}`;
}

function formatShortDate(session: SetupSession) {
  const date = new Date(`${session.session_date}T12:00:00`);
  const shortDate = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = session.session_time ? session.session_time.slice(0, 5) : "";
  return [shortDate, time].filter(Boolean).join(" ");
}

function featureMessage(_feature: string, _limits: AccountLimits | null) {
  return "Want to add a custom track? Upgrade to Premium to add new tracks!";
}

function searchableTrackText(track: TrackWithNotes) {
  const notes = track.notesRecord;
  return [
    track.name,
    track.location,
    track.surface,
    track.length,
    track.is_banked ? "banked" : "flat",
    track.is_system ? "system track" : "my track your track private track",
    notes?.layout_notes,
    notes?.line_notes,
    notes?.surface_notes,
    notes?.tire_notes,
    notes?.facility_notes,
    notes?.notes,
  ]
    .filter(Boolean)
    .join(" ");
}
