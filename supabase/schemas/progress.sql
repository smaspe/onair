-- The watch data of a signed-in user: which episode they reached, what they make of the
-- show, and whether they dropped it.
--
-- This file is the schema. Edit it, then generate the migration that gets there:
--
--   supabase db schema declarative sync -f <name>
--
-- The command compares the migrations against this tree. The files under migrations/ are
-- generated and are not meant to be read; this one is.

create table progress (
  user_id    uuid references auth.users on delete cascade,
  show_id    int,
  imdb_id    text,

  -- Which episodes are watched: season number against the list of episode numbers in it. A
  -- reader can watch episodes in any order and can leave a gap behind them, so one mark
  -- cannot state this.
  --
  -- Null means the row does not state a set yet. A client that knows the set sends it. An
  -- empty object means the reader cleared every episode, which is a different thing, so this
  -- column has no default: '{}' would make the two the same.
  watched    jsonb,

  -- The furthest episode watched. No client writes these any more, and they are dropped once
  -- every row states a set — until then they are the only record of a row that does not.
  season     int,
  episode    int,

  rating     int,
  dropped    bool not null default false,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),

  -- One row per show per user. Two devices marking two different shows write two different
  -- rows, and Postgres settles them with no merge code.
  primary key (user_id, show_id)
);

alter table progress enable row level security;

-- Every row belongs to one user, and only that user reaches it. `auth.uid()` is wrapped in a
-- select so the planner runs it once for the query instead of once per row.
create policy own_rows on progress
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- One clock decides the order of two writes, so a device with a wrong clock cannot win a
-- conflict. A client that sends this column is overruled.
--
-- The empty search path means names resolve to nothing implicitly, which is why now() is
-- written in full.
create function touch_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end $$;

create trigger progress_touch
  before insert or update on progress
  for each row execute function touch_updated_at();

-- A second device hears about a change instead of holding a stale row.
alter publication supabase_realtime add table progress;

-- New tables reach nobody until they are granted to somebody, so the grant is written here
-- rather than inherited. Row level security then narrows this to the rows of one user.
--
-- `anon` is left out on purpose: a reader with no account keeps their watch data in the
-- browser and never touches this table. Without the grant the table is closed to them
-- whatever the policy says.
grant select, insert, update, delete on progress to authenticated;
