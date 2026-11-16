-- The watch data of every library: which episodes are watched, what the reader makes of the
-- show, and whether they dropped it. One row per show per library, so two devices that mark two
-- different shows write two different rows.
create table progress (
  -- The SHA-256 of the sync code, in hex. The code itself is not stored: a copy of this table
  -- does not open any library.
  library    text    not null,

  -- The TMDB id of the show.
  show_id    integer not null,

  -- JSON. Season number against the list of episode numbers that are watched in it.
  watched    text    not null default '{}',

  -- When the reader last marked an episode of this show as watched, as the device states it.
  -- Null for a show that has no mark.
  marked_at  text,

  rating     integer,
  dropped    integer not null default 0,

  -- A removed show keeps its row. Without the row, a device that has not heard of the removal
  -- writes the show back.
  deleted    integer not null default 0,

  -- Milliseconds, set by the Worker on every write. A write must state the value it last saw,
  -- and the Worker refuses the write when the row has a newer one.
  updated_at integer not null,

  primary key (library, show_id)
) without rowid;
