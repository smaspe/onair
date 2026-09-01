# User data

The watch data is which episode you reached, what you make of a show, and whether you dropped
it. Where it lives depends on whether you have an account.

## Two modes

The app works in both, and it never asks for an account.

**Anonymous.** localStorage holds the watch data. It stays on that device. The export and
import buttons move it to another device as a JSON file. This is the whole feature set for a
user who wants no account.

**Signed in.** Supabase holds the watch data and localStorage becomes a cache of it. The app
reads the cache first, so it paints immediately, then reconciles with the server.

**The upgrade.** A user who signs in for the first time keeps what they already track: the
client uploads the local rows and applies the merge rules below to any show that already has
a row on the server. localStorage is not cleared. It becomes the cache.

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

`show_id` is the TMDB id, because that is what the client asks for. `imdb_id` rides along
because every show database maps it and it arrives free in the TMDB payload. A change of
provider then reads the same string instead of remapping every row, which would otherwise
force every user to reload their library before the app worked again.

The SQL to apply this is in `supabase.md`.

## Merge rules

Conflicts only happen when two devices write the same show.

**The newer row wins.** A rating and a dropped flag are opinions, so the latest one holds.

**A realtime subscription keeps clients fresh.** This is what makes the rule above safe. A tab
left open for a week holds stale progress, and a click in that tab writes a lower episode
number over a higher one. The subscription removes the stale state instead of merging around
it.

**A delete leaves a tombstone.** `deleted_at` marks the row and reads filter it out. A hard
delete lets a second device write the row again.

If a lost episode ever happens in practice, merge the progress as a maximum instead: compare
the absolute episode index and keep the higher one. That refuses a rewind, so it also needs a
version counter for the un-watch button. Do this when there is evidence, not before.

## Keys

The `anon` key ships in the static page. That is what it is for: it grants nothing on its own,
because every read and write goes through the policy above. The `service_role` key bypasses
row level security and must never reach the client.
