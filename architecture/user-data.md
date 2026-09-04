# User data

The watch data is what's seen, the rating of shows, and what's dropped.

## Two modes

**Anonymous.** localStorage holds the watch data. It stays on that device. The export and
import buttons move it to another device as a JSON file. This is the whole feature set for a
user who wants no account.

**Signed in.** Supabase holds the watch data and localStorage becomes a cache of it. The app
reads the cache first, so it paints immediately, then reconciles with the server.

**The upgrade.** A user who signs in for the first time keeps what they already track: the
client uploads every show the server does not hold. Where both hold the same show, the row
stands. localStorage keeps no timestamp, so the two cannot be ordered by age, and a cache does
not win against its source. localStorage is not cleared. It becomes the cache.

## The schema

One row per show, not one document per user. Two devices that mark two different shows write
two different rows, and Postgres settles them with no merge code at all.

```sql
create table progress (
  user_id    uuid references auth.users on delete cascade,
  show_id    int,
  imdb_id    text,
  season     int  not null,
  episode    int  not null,
  rating     int,
  dropped    bool not null default false,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, show_id)
);
```

Row level security limits every row to `auth.uid() = user_id`. A trigger sets `updated_at`.
Clients must not send that column: one server clock decides the order, so a device with a
wrong clock cannot win.

`show_id` is the TMDB id, because that is what the client asks for. `imdb_id` is there because
every show database maps it. A change of provider then reads the same string instead of
remapping every row, which would otherwise force every user to reload their library before the
app worked again.

**The column is empty today.** TMDB returns `imdb_id` for a film but not for a series; a series
carries it under `append_to_response=external_ids`, and the proxy rejects any parameter that is
not on its allowlist. Until the proxy asks for it, the escape hatch is not armed.

`supabase/schemas/progress.sql` is the schema. The files under `supabase/migrations/` are
generated from it and are not meant to be read.

## Merge rules

Conflicts only happen when two devices write the same show.

**The newer row wins.** A rating and a dropped flag are opinions, so the latest one holds.

**A realtime subscription keeps clients fresh.** This is what makes the rule above safe. A tab
left open for a week holds stale progress, and a click in that tab writes a lower episode
number over a higher one. The subscription removes the stale state instead of merging around
it.

**A delete leaves a tombstone.** `deleted_at` marks the row and reads filter it out. A hard
delete lets a second device write the row again.

**A write that never reaches the table is lost.** The client writes to localStorage first and
to the table second. Nothing retries the second half, so a change made while the network is
down survives only until the next read replaces it. Keeping `updated_at` beside the local
progress would let a genuinely newer local row win, at the cost of trusting the device clock
for that one comparison.

If a lost episode ever happens in practice, merge the progress as a maximum instead: compare
the absolute episode index and keep the higher one. That refuses a rewind, so it also needs a
version counter for the un-watch button. Do this when there is evidence, not before.

## Keys

Supabase issues a **publishable** key, `sb_publishable_…`, and a **secret** key, `sb_secret_…`.

The publishable key is committed to this repository and served to every visitor. Supabase
intends that — its own documentation lists source code among the safe places for it — because
the key only says which project is being addressed. It carries no permission of its own: the
policy above decides what can be read and written, and by whom.

**That means row level security is the only thing protecting the data.** A table with RLS off,
or a policy that does not check `auth.uid()`, is readable and writable by anyone who opens the
page and copies the key out of it. Check the policy before the table holds anything real.

The secret key bypasses row level security entirely. It belongs in `wrangler secret` or the
Supabase dashboard, never in this repository and never in anything the browser loads.
