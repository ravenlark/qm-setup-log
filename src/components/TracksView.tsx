import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, MapPin, Pencil, Plus, Save, Star, Trash2, X } from "lucide-react";
import { fetchSessions, type SetupSession } from "../data/sessions";
import {
  ACCOUNT_FEATURES,
  fetchAccountLimits,
  hasAccountFeature,
  type AccountLimits,
} from "../data/subscriptions";
import {
  createPrivateTrack,
  fetchTrackCatalog,
  fetchUserTracks,
  removePrivateTrack,
  saveTrackNotes,
  setTrackFavorite,
  updatePrivateTrack,
  type TrackInput,
  type TrackNotes,
  type TrackNotesInput,
  type TrackWithNotes,
} from "../data/tracks";

const emptyTrackForm: TrackInput = {
  name: "",
  street_address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
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

type TrackModal = "add" | "track" | "notes" | null;
type AddTrackTab = "catalog" | "custom";
type CatalogStatus = "idle" | "loading" | "ready";
type ViewStatus = "loading" | "ready" | "saving";
type TrackStats = {
  lastSession: SetupSession | null;
  totalLaps: number;
  totalSessions: number;
};

type TrackGroup = {
  title: string;
  tracks: TrackWithNotes[];
};

export function TracksView({ supabase, userId }: TracksViewProps) {
  const [tracks, setTracks] = useState<TrackWithNotes[]>([]);
  const [catalogTracks, setCatalogTracks] = useState<TrackWithNotes[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [editingTrackId, setEditingTrackId] = useState("");
  const [expandedTrackId, setExpandedTrackId] = useState("");
  const [notesTrackId, setNotesTrackId] = useState("");
  const [activeModal, setActiveModal] = useState<TrackModal>(null);
  const [addTrackTab, setAddTrackTab] = useState<AddTrackTab>("catalog");
  const [trackForm, setTrackForm] = useState(emptyTrackForm);
  const [notesForm, setNotesForm] = useState(emptyNotesForm);
  const [trackSearch, setTrackSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [accountLimits, setAccountLimits] = useState<AccountLimits | null>(null);
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("idle");
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
      return !search || searchableTrackText(track).toLowerCase().includes(search);
    });
  }, [trackSearch, tracks]);

  const visibleCatalogTracks = useMemo(() => {
    const search = catalogSearch.trim().toLowerCase();
    return catalogTracks.filter((track) => {
      return !search || searchableTrackText(track).toLowerCase().includes(search);
    });
  }, [catalogSearch, catalogTracks]);

  const organizedTracks = useMemo(
    () => organizeTracks(visibleTracks),
    [visibleTracks],
  );

  const canCreateCustomTracks = hasAccountFeature(
    accountLimits,
    ACCOUNT_FEATURES.customTracks,
  );

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([
      fetchUserTracks(supabase, userId),
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

  async function loadCatalog() {
    if (catalogStatus === "loading" || catalogStatus === "ready") return;

    setCatalogStatus("loading");
    try {
      const nextCatalogTracks = await fetchTrackCatalog(supabase, userId);
      setCatalogTracks(nextCatalogTracks);
      setCatalogStatus("ready");
    } catch (error) {
      setCatalogStatus("ready");
      setMessage(
        error instanceof Error ? error.message : "Track catalog could not be loaded.",
      );
    }
  }

  function startTrackAdd() {
    setEditingTrackId("");
    setTrackForm(emptyTrackForm);
    setNotesTrackId("");
    setNotesForm(emptyNotesForm);
    setCatalogSearch("");
    setAddTrackTab("catalog");
    setMessage("");
    setActiveModal("add");
    void loadCatalog();
  }

  function startTrackEdit(track: TrackWithNotes) {
    if (track.is_system) {
      startNotesEdit(track);
      return;
    }

    setEditingTrackId(track.id);
    setTrackForm({
      name: track.name,
      street_address: track.street_address ?? "",
      city: track.city ?? "",
      state: track.state ?? "",
      postal_code: track.postal_code ?? "",
      country: track.country ?? "US",
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
    setActiveModal((current) =>
      current === "track" || current === "add" ? null : current,
    );
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
    if (!trackForm.city.trim() || !trackForm.state.trim()) {
      setMessage("City and state are required.");
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
        return [
          ...withoutSaved,
          {
            ...saved,
            is_favorite: savedNotes?.is_favorite ?? false,
            notesRecord: savedNotes,
          },
        ].sort(sortTracksByName);
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
      updateTrackNotes(savedNotes);
      resetNotesForm();
      setMessage("Track notes saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notes could not be saved.");
    } finally {
      setStatus("ready");
    }
  }

  async function handleToggleFavorite(track: TrackWithNotes) {
    setStatus("saving");
    setMessage("");
    try {
      const savedNotes = await setTrackFavorite(
        supabase,
        userId,
        track.id,
        !track.is_favorite,
      );
      updateTrackFavorite(track, savedNotes);
      setMessage(savedNotes.is_favorite ? "Track added to favorites." : "Favorite removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Favorite could not be updated.",
      );
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteTrack(track: TrackWithNotes) {
    if (track.is_system) return;
    const confirmed = window.confirm(
      `Remove "${track.name}" from your tracks?`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await removePrivateTrack(supabase, userId, track.id);
      setTracks((current) => current.filter((item) => item.id !== track.id));
      if (editingTrackId === track.id) resetTrackForm();
      if (notesTrackId === track.id) resetNotesForm();
      if (expandedTrackId === track.id) setExpandedTrackId("");
      setMessage("Track removed from your tracks.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Track could not be removed.",
      );
    } finally {
      setStatus("ready");
    }
  }

  function updateTrackNotes(savedNotes: TrackNotes) {
    setTracks((current) =>
      current.map((track) =>
        track.id === savedNotes.track_id
          ? {
              ...track,
              is_favorite: savedNotes.is_favorite,
              notesRecord: mergeNotes(track.notesRecord, savedNotes),
            }
          : track,
      ),
    );
    setCatalogTracks((current) =>
      current.map((track) =>
        track.id === savedNotes.track_id
          ? {
              ...track,
              is_favorite: savedNotes.is_favorite,
              notesRecord: mergeNotes(track.notesRecord, savedNotes),
            }
          : track,
      ),
    );
  }

  function updateTrackFavorite(track: TrackWithNotes, savedNotes: TrackNotes) {
    const updatedTrack = {
      ...track,
      is_favorite: savedNotes.is_favorite,
      notesRecord: mergeNotes(track.notesRecord, savedNotes),
    };

    setTracks((current) => {
      const withoutTrack = current.filter((item) => item.id !== track.id);
      if (updatedTrack.is_system && !updatedTrack.is_favorite) {
        return withoutTrack;
      }
      return [...withoutTrack, updatedTrack].sort(sortTracksByName);
    });

    setCatalogTracks((current) =>
      current.map((item) => (item.id === track.id ? updatedTrack : item)),
    );
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
              disabled={status === "saving"}
              type="button"
              onClick={startTrackAdd}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="track-list-controls">
          <input
            aria-label="Search tracks"
            type="search"
            value={trackSearch}
            placeholder="Search your tracks"
            onChange={(event) => setTrackSearch(event.target.value)}
          />
        </div>

        {status === "loading" ? (
          <div className="empty-state">Loading tracks...</div>
        ) : visibleTracks.length ? (
          <div className="track-group-list">
            {organizedTracks.map((group) => (
              <TrackListSection
                expandedTrackId={expandedTrackId}
                key={group.title}
                group={group}
                status={status}
                statsByTrackId={trackStatsByTrackId}
                onDelete={handleDeleteTrack}
                onEdit={startTrackEdit}
                onNotes={startNotesEdit}
                onToggle={(track) =>
                  setExpandedTrackId((current) =>
                    current === track.id ? "" : track.id,
                  )
                }
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        ) : tracks.length ? (
          <div className="empty-state">No tracks match your search.</div>
        ) : (
          <div className="empty-state">No favorite or custom tracks yet.</div>
        )}
      </div>

      {message ? <div className="inline-message garage-message">{message}</div> : null}

      {activeModal === "add" ? (
        <Modal
          eyebrow="Add Track"
          icon={<MapPin size={20} />}
          title="Add Track"
          onClose={resetTrackForm}
        >
          <div className="track-add-tabs" role="tablist" aria-label="Add track options">
            <button
              aria-selected={addTrackTab === "catalog"}
              role="tab"
              type="button"
              onClick={() => {
                setAddTrackTab("catalog");
                void loadCatalog();
              }}
            >
              Track Catalog
            </button>
            <button
              aria-selected={addTrackTab === "custom"}
              role="tab"
              type="button"
              onClick={() => setAddTrackTab("custom")}
            >
              Custom Track
            </button>
          </div>

          {addTrackTab === "catalog" ? (
            <div className="track-catalog-panel">
              <input
                aria-label="Search track catalog"
                type="search"
                value={catalogSearch}
                placeholder="Search track catalog"
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
              {catalogStatus === "loading" ? (
                <div className="empty-state">Loading catalog...</div>
              ) : visibleCatalogTracks.length ? (
                <div className="catalog-track-list">
                  {visibleCatalogTracks.map((track) => (
                    <CatalogTrackRow
                      key={track.id}
                      status={status}
                      track={track}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              ) : catalogTracks.length ? (
                <div className="empty-state">No catalog tracks match your search.</div>
              ) : (
                <div className="empty-state">No catalog tracks available.</div>
              )}
            </div>
          ) : canCreateCustomTracks ? (
            <form onSubmit={handleSaveTrack}>
              <TrackFormFields trackForm={trackForm} setTrackForm={setTrackForm} />
              <TrackNotesFields notesForm={notesForm} setNotesForm={setNotesForm} />
              <div className="button-row">
                <button className="secondary-button" type="button" onClick={resetTrackForm}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={status === "saving"}
                  type="submit"
                >
                  <Plus size={18} />
                  Add Track
                </button>
              </div>
            </form>
          ) : (
            <div className="limit-notice">
              {featureMessage("custom tracks", accountLimits)}
            </div>
          )}
        </Modal>
      ) : null}

      {activeModal === "track" ? (
        <Modal
          eyebrow="Edit Track"
          icon={<MapPin size={20} />}
          title={trackForm.name || "Track"}
          onClose={resetTrackForm}
        >
          <form onSubmit={handleSaveTrack}>
            <TrackFormFields trackForm={trackForm} setTrackForm={setTrackForm} />
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={resetTrackForm}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={status === "saving"}
                type="submit"
              >
                <Save size={18} />
                Save Track
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
            <TrackNotesFields notesForm={notesForm} setNotesForm={setNotesForm} />
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

function TrackListSection({
  expandedTrackId,
  group,
  onDelete,
  onEdit,
  onNotes,
  onToggle,
  onToggleFavorite,
  statsByTrackId,
  status,
}: {
  expandedTrackId: string;
  group: TrackGroup;
  onDelete: (track: TrackWithNotes) => void;
  onEdit: (track: TrackWithNotes) => void;
  onNotes: (track: TrackWithNotes) => void;
  onToggle: (track: TrackWithNotes) => void;
  onToggleFavorite: (track: TrackWithNotes) => void;
  statsByTrackId: Map<string, TrackStats>;
  status: ViewStatus;
}) {
  return (
    <section className="track-group">
      <div className="track-group-header">
        <h3>{group.title}</h3>
        <span>{group.tracks.length}</span>
      </div>
      <div className="track-row-list">
        {group.tracks.map((track) => (
          <TrackRow
            expanded={expandedTrackId === track.id}
            key={track.id}
            stats={statsByTrackId.get(track.id)}
            status={status}
            track={track}
            onDelete={onDelete}
            onEdit={onEdit}
            onNotes={onNotes}
            onToggle={onToggle}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </section>
  );
}

function TrackRow({
  expanded,
  onDelete,
  onEdit,
  onNotes,
  onToggle,
  onToggleFavorite,
  stats,
  status,
  track,
}: {
  expanded: boolean;
  onDelete: (track: TrackWithNotes) => void;
  onEdit: (track: TrackWithNotes) => void;
  onNotes: (track: TrackWithNotes) => void;
  onToggle: (track: TrackWithNotes) => void;
  onToggleFavorite: (track: TrackWithNotes) => void;
  stats: TrackStats | undefined;
  status: ViewStatus;
  track: TrackWithNotes;
}) {
  const noteLines = trackNoteLines(track);

  return (
    <article
      className={[
        "track-compact-row",
        track.is_system ? "track-card-system" : "track-card-user",
        track.is_favorite ? "track-compact-row-favorite" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="track-compact-summary">
        <button
          aria-label={
            track.is_favorite
              ? `Remove ${track.name} from favorites`
              : `Add ${track.name} to favorites`
          }
          className={`icon-button favorite-button ${
            track.is_favorite ? "favorite-button-active" : ""
          }`}
          disabled={status === "saving"}
          type="button"
          onClick={() => onToggleFavorite(track)}
        >
          <Star size={18} fill={track.is_favorite ? "currentColor" : "none"} />
        </button>
        <button
          aria-expanded={expanded}
          className="track-compact-toggle"
          type="button"
          onClick={() => onToggle(track)}
        >
          <span className="track-compact-title">
            <strong>{track.name}</strong>
            <span>{trackSummary(track)}</span>
          </span>
          <span className="track-compact-pills">
            {!track.is_system ? <span className="garage-kind">My Track</span> : null}
            {track.surface ? <span className="session-pill">{track.surface}</span> : null}
            {track.length ? <span className="session-pill">{track.length}</span> : null}
            <span className="session-pill">{track.is_banked ? "Banked" : "Flat"}</span>
          </span>
          <span className="track-compact-stats">
            <span>{stats?.totalSessions ?? 0} sessions</span>
            <span>{stats?.lastSession ? formatShortDate(stats.lastSession) : "No sessions"}</span>
          </span>
          <ChevronDown size={18} />
        </button>
      </div>

      {expanded ? (
        <div className="track-compact-detail">
          <div className="session-history-stats">
            <TrackStat label="Total Sessions" value={String(stats?.totalSessions ?? 0)} />
            <TrackStat
              label="Last Session"
              value={stats?.lastSession ? formatShortDate(stats.lastSession) : "--"}
            />
            <TrackStat label="Total Laps" value={String(stats?.totalLaps ?? 0)} />
          </div>

          {formatFullAddress(track) ? (
            <p className="track-address-line">{formatFullAddress(track)}</p>
          ) : null}

          {noteLines.length ? (
            <div className="track-card-notes">
              {noteLines.map((note) => (
                <NoteLine key={note.label} label={note.label} value={note.value} />
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty-state">No track notes yet.</div>
          )}

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
        </div>
      ) : null}
    </article>
  );
}

function CatalogTrackRow({
  onToggleFavorite,
  status,
  track,
}: {
  onToggleFavorite: (track: TrackWithNotes) => void;
  status: ViewStatus;
  track: TrackWithNotes;
}) {
  return (
    <article className="catalog-track-row">
      <div>
        <strong>{track.name}</strong>
        <span>{trackSummary(track)}</span>
      </div>
      <button
        aria-label={
          track.is_favorite
            ? `Remove ${track.name} from favorites`
            : `Add ${track.name} to favorites`
        }
        className={`icon-button favorite-button ${
          track.is_favorite ? "favorite-button-active" : ""
        }`}
        disabled={status === "saving"}
        type="button"
        onClick={() => onToggleFavorite(track)}
      >
        <Star size={18} fill={track.is_favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

function TrackFormFields({
  setTrackForm,
  trackForm,
}: {
  setTrackForm: (track: TrackInput) => void;
  trackForm: TrackInput;
}) {
  return (
    <>
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
          Street Address
          <input
            value={trackForm.street_address}
            onChange={(event) =>
              setTrackForm({
                ...trackForm,
                street_address: event.target.value,
              })
            }
            placeholder="123 Raceway Rd"
          />
        </label>
        <label>
          City
          <input
            required
            value={trackForm.city}
            onChange={(event) =>
              setTrackForm({ ...trackForm, city: event.target.value })
            }
            placeholder="Graham"
          />
        </label>
        <label>
          State
          <input
            required
            value={trackForm.state}
            onChange={(event) =>
              setTrackForm({ ...trackForm, state: event.target.value })
            }
            placeholder="WA"
          />
        </label>
        <label>
          Postal Code
          <input
            value={trackForm.postal_code}
            onChange={(event) =>
              setTrackForm({ ...trackForm, postal_code: event.target.value })
            }
            placeholder="98338"
          />
        </label>
        <label>
          Country
          <input
            value={trackForm.country}
            onChange={(event) =>
              setTrackForm({ ...trackForm, country: event.target.value })
            }
            placeholder="US"
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
    </>
  );
}

function TrackNotesFields({
  notesForm,
  setNotesForm,
}: {
  notesForm: TrackNotesInput;
  setNotesForm: (notes: TrackNotesInput) => void;
}) {
  return (
    <div className="form-grid notes-grid">
      <label>
        Layout Notes
        <textarea
          value={notesForm.layout_notes}
          onChange={(event) =>
            setNotesForm({ ...notesForm, layout_notes: event.target.value })
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
            setNotesForm({ ...notesForm, surface_notes: event.target.value })
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
            setNotesForm({ ...notesForm, facility_notes: event.target.value })
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
  );
}

function TrackStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-mini-stat">
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

function organizeTracks(tracks: TrackWithNotes[]): TrackGroup[] {
  const favorites = tracks.filter((track) => track.is_favorite).sort(sortTracksByName);
  const myTracks = tracks
    .filter((track) => !track.is_favorite && !track.is_system)
    .sort(sortTracksByName);

  return [
    favorites.length ? { title: "Favorites", tracks: favorites } : null,
    myTracks.length ? { title: "My Tracks", tracks: myTracks } : null,
  ].filter((group): group is TrackGroup => Boolean(group));
}

function sortTracksByName(a: TrackWithNotes, b: TrackWithNotes) {
  return a.name.localeCompare(b.name);
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

function mergeNotes(current: TrackNotes | null, saved: TrackNotes): TrackNotes {
  return {
    ...(current ?? saved),
    ...saved,
  };
}

function trackNoteLines(track: TrackWithNotes) {
  const notes = track.notesRecord;
  return [
    { label: "Layout", value: notes?.layout_notes },
    { label: "Line", value: notes?.line_notes },
    { label: "Surface", value: notes?.surface_notes },
    { label: "Tires/Stagger", value: notes?.tire_notes },
    { label: "Facility", value: notes?.facility_notes },
    { label: "Notes", value: notes?.notes },
  ].filter((note) => Boolean(note.value?.trim()));
}

function trackSummary(track: TrackWithNotes) {
  return [formatCityState(track), track.country].filter(Boolean).join(" - ");
}

function formatCityState(track: TrackWithNotes) {
  return [track.city, track.state].filter(Boolean).join(", ") || track.location;
}

function formatFullAddress(track: TrackWithNotes) {
  const cityLine = [
    track.city,
    [track.state, track.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return [track.street_address, cityLine, track.country].filter(Boolean).join(" - ");
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
    track.street_address,
    track.city,
    track.state,
    track.postal_code,
    track.country,
    track.surface,
    track.length,
    track.is_banked ? "banked" : "flat",
    track.is_favorite ? "favorite favorites" : "",
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
