# Offline

How the app reads and writes when it cannot reach the network. This is the current state, not
a plan.

## Why it needs saying at all

Only the watch progress is stored: which episode you are on, what you made of the show, and
whether you dropped it. Four fields per show. Everything else — the title, the seasons, the air
dates, the artwork — is asked of TMDB on every load and thrown away.

That keeps the storage small and the backup file honest, but it has one consequence: **a
browser with no network knows a list of numbers.** Not a shelf with missing pictures. Sixty-odd
ids, no titles, nothing to draw.

So offline needs two separate things, and they fail in different directions:

| | Problem | Answer |
| --- | --- | --- |
| Reading | TMDB cannot be asked what a show is | the service worker keeps the answers |
| Writing | Supabase cannot be told what changed | the browser records which shows have an unsent change |

## What is stored, and where

```mermaid
flowchart TB
  subgraph browser["The browser"]
    subgraph ls["localStorage"]
      watched["onair.watched<br/>four fields per show"]
      waiting["onair.waiting<br/>ids with an unsent change"]
      theme["onair.theme"]
    end
    subgraph cs["Cache Storage, filled by the service worker"]
      shell["onair-shell<br/>page, styles, modules, font"]
      data["onair-data<br/>TMDB answers"]
      art["onair-art<br/>posters and backdrops"]
    end
    memory["The shelf in memory<br/>full records, rebuilt every load"]
  end

  watched --> memory
  data --> memory
  memory --> watched
  memory --> waiting
```

`localStorage` is the truth about the reader. Cache Storage is a copy of what TMDB and the
Worker said, and can be deleted at any time with no loss.

## Reading

The service worker answers every request the page makes. Three caches, and one rule each.

```mermaid
flowchart LR
  req["A request"] --> nav{"What is it?"}
  nav -->|"the page"| shell["onair-shell"]
  nav -->|"a file the page needs"| shell
  nav -->|"/api/..."| data["onair-data"]
  nav -->|"/api/search/..."| net["Network only"]
  nav -->|"a poster"| art["onair-art"]
  nav -->|"Supabase"| net

  shell --> swr["Answer from the copy held,<br/>fetch a newer one for next time"]
  data --> swr
  art --> keep["Answer from the copy held,<br/>fetch only the first time"]
```

**The page itself is answered from the cache, not from the network first.** Asking the network
first makes opening the app wait for a request to time out at exactly the moment the cache
exists for.

The cost is one stale load after a deploy. The worker compares the `ETag` of what it fetched
against the `ETag` of what it held; when they differ it messages the page, and the page offers
to start again. The page never changes while someone reads it. Cloudflare serves an `ETag` that is a
hash of the file, so this needs no version number and no build step to write one.

A search is not cached. It is typed once and the answer is never wanted again.

Posters are answered from the copy held and fetched only once, because a TMDB image address
names a size and a file that do not change.

## Writing

A change is written to `localStorage` first and sent to the table second. When the second half
fails, the show id is added to `onair.waiting`, against the word for the write it still needs:

```json
{ "136315": "push", "1408": "gone" }
```

`push` means the row has to be written. `gone` means the row has to be marked deleted. Nothing
else can be waiting.

```mermaid
sequenceDiagram
  participant U as Reader
  participant L as library
  participant S as localStorage
  participant T as Supabase

  U->>L: mark episode 11 watched
  L->>S: onair.watched, episode 11
  L->>T: upsert
  T--xL: no connection
  L->>S: onair.waiting, show 136315 needs a push
  Note over U: the masthead reads 1 waiting

  U->>L: mark episode 12 watched
  L->>S: onair.watched, episode 12
  L->>T: upsert
  T--xL: no connection
  L->>S: onair.waiting, show 136315 needs a push
  Note over S: still one entry, not two

  Note over L: the connection returns
  L->>T: upsert episode 12
  T-->>L: taken
  L->>S: onair.waiting is empty
  Note over U: the masthead reads Synced
```

### The list stores ids, not changes

This is the part worth being deliberate about. `onair.waiting` records **which** shows need a
write, never **what** the write is.

The shelf already stores what to send. A show in the list is read from the shelf at the moment
it is sent, so:

- Three marks made offline cost one write, not three.
- A change cannot go stale against the shelf, because it is read from the shelf at send time.
- Nothing has to be reconciled: there is one value per show, and it is the one on screen.

A removed show is the one exception. It is no longer on the shelf to read, so `gone` is the
whole of what there is to remember about it.

### Why a separate key and not a field on the show

`onair.watched` is filtered to four fields on every write, and those four fields are also what
the backup file contains and what the table row contains. A fifth field for "not sent yet"
would follow the show into the export and into Postgres, where it means nothing: whether *this*
browser managed to reach the table is a fact about the browser, not about the show.

Keeping it in `onair.waiting` also means a reader who never signs in never writes the key at
all.

### The order matters

The list is emptied when the browser fires `online`, and again on every sign in — and on sign
in **it runs before the pull**:

```mermaid
sequenceDiagram
  participant L as library
  participant T as Supabase

  Note over L: sign in
  L->>T: send everything in onair.waiting
  L->>T: read every row
  T-->>L: rows
  L->>L: rows overwrite the shelf
  L->>T: send every show the table did not have
```

Reversing the first two steps loses data. The pull overwrites the shelf with the table's rows,
so a change that never left would be replaced by the older value it was meant to supersede —
and then sent back up over itself.

The last step is the same mechanism for a different case. A library built with no account has
no row in the table for any show, so the first sign in sends all of them.

## What this does not do

**It does not keep a history.** One entry per show, and that entry is one word. If a show is marked
five times offline, the table learns the fifth value and never learns that the first four
happened. For watch progress that is the right answer — the question is "where am I", not "how
did I get here" — but it does mean the app cannot answer "when did I watch this".

**It does not resolve conflicts.** A change sent late overwrites the row for that show. Two devices editing the same show while one is offline is settled by whoever writes
last, which is the same rule the table already uses. The realtime subscription keeps open tabs
level, but it cannot help a tab that was not listening.

**It does not survive a cleared browser.** `localStorage` is the only copy of an unsent change.

**Signed out, nothing waits.** There is no table to be behind, so the writes that fail are the
ones that were never attempted, and the count stays at zero.
