# Plan: Firebase for accounts and watch data

A working plan. Delete it when the work ships and the facts are in `architecture/`.

## End state

- Firebase Authentication does sign-up, sign-in, password reset and password change.
- Cloud Firestore stores the watch data of signed-in users.
- The project is on the Spark plan: no card, so no bill is possible.
- `supabase/` and every Supabase call are gone.
- The four rules in `onair-constraints` still hold: no build step, no secret in the client,
  anonymous use works, no offline mode.

No account exists that has to be kept. The owner's own library stays in `localStorage`, and the
first sign-in uploads it.

## Data shape

One document per show, so two devices that mark two different shows never write the same
document.

```
users/{uid}/progress/{showId}
  watched    map | null      season number -> list of episode numbers. {} = all cleared, null = not stated
  rating     number | null
  dropped    bool
  markedAt   timestamp | null   last time an episode was marked watched. Null = never. Nothing reads it yet.
  imdbId     string | null      stays empty until the proxy asks TMDB for external_ids
  deletedAt  timestamp | null   a tombstone, as today
  updatedAt  timestamp          always serverTimestamp()
```

Rules, in `firebase/firestore.rules`:

- A user reads and writes only `users/{their uid}/...`.
- A write must set `updatedAt == request.time`, so a wrong device clock cannot set it.
- Field types are checked (`watched` is a map or null, `dropped` is a bool, and so on).

Each write sends the whole document, with no `merge`. A cleared season must disappear from
`watched`, and a merge may keep the old key.

## Steps

Each step ends with a check. The first step decides several later ones.

### 0. Spike (done, against the local emulators, SDK 12.19.0)

The emulators run Auth and Firestore with the rules from this plan. They behave like production
except where the text below says otherwise.

| Question | Result | Consequence |
| --- | --- | --- |
| Offline, does `setDoc` resolve, reject or wait? | It **waits**, and resolves after reconnect. `updateDoc` waits too. | A mark made offline is not recorded as unsent unless the app records it first. See step 3. |
| Does the listener echo this device's own writes? | Yes, twice: once at once with `hasPendingWrites: true`, once on acknowledgement. | The handler ignores changes with `hasPendingWrites`. |
| Does `setDoc` with no `merge` drop a cleared season? | Yes. With `merge: true` the cleared season **stays**. | Every write sends the whole document, with no `merge`. |
| Are `{}` and `null` different after a round trip? | Yes. | "All cleared" and "not stated" stay distinct. |
| Do the rules hold? | Own write: allowed. Client clock for `updatedAt`: denied. Bad field type: denied. Another user reads or writes: denied. A numeric string as document ID: fine. | Rules are as drafted. |
| What does `updateDoc` give for a missing document? | `permission-denied`, because the rules check the resulting document, which has no `dropped`. The `not-found` code was not seen. | `bury()` writes a whole tombstone with `setDoc` instead. |
| SDK cost | Three requests, compressed: 24 KB, 42 KB and 179 KB. | The Supabase bundle was 17 requests. |
| Does the session survive a reload? | Yes. | |
| Reset in the emulator | The link works. The old password fails and the new one works. | |

**The emulator differs from production for sign-in errors.** It answers `auth/wrong-password`,
`auth/user-not-found` and, for a reset to an unknown address, an error. Production has
email-enumeration protection on by default and should answer `auth/invalid-credential` and no
error. Handle both sets of codes, and confirm the real answers in step 1.

**Not answered here:** whether a reset email reaches an inbox at Gmail, Outlook and Yahoo, and what
the app sees past the reset cap. Both need the real project.

### 1. The Firebase project (manual, in the console)

Write the result into `firebase.md`, a runbook kept out of the repository like `supabase.md`.

1. Create the project. **The project ID is set once and appears in the reset link and the default
   sender.** Pick it after the app name is decided (see TODO).
2. Turn off Analytics.
3. Add a web app. Copy the config object. It is public, like the Supabase publishable key.
4. Authentication: enable Email/Password only. Leave email-enumeration protection on.
5. Authentication, Settings: add `onair.smaspe.workers.dev` to the authorized domains.
6. Authentication, Templates: set the sender name and the password reset text.
7. Firestore: create the database. **The location is set once.**
8. Skip App Check. It answers real abuse, not the risk of it. This is the same reasoning as Turnstile
   on the TMDB proxy.

Check: the console shows one web app, one provider, one empty database.

### 2. Repository files

- `firebase.json` and `.firebaserc` at the root.
- `firebase/firestore.rules`.
- `.gitignore`: add `firebase.md`.

Deploy with `firebase deploy --only firestore:rules`. Check in the emulator that a second user
cannot read or write the first user's documents.

### 3. Swap the client (first PR, parity with today)

| File | Change |
| --- | --- |
| `public/js/firebase.js` | Replaces `supabase.js`. Loads the pinned SDK from `www.gstatic.com/firebasejs/<version>/` on first use. |
| `public/js/account.js` | The call mapping from the earlier discussion. Errors throw, so `report()` becomes a try/catch with a message for each expected code. The "check your email" branch in `signUp` goes. |
| `public/js/sync.js` | Firestore, described below. |
| `public/js/library.js` | `take`, `adopt` and `accept` read camelCase fields (`id`, `markedAt`, `deletedAt`) instead of the Postgres column names. |
| `public/sw.js` | `/js/supabase.js` becomes `/js/firebase.js` in `FILES`. Add `www.gstatic.com` to `IMMUTABLE`: the SDK address names an exact version, so the held copy never needs a refresh, and a signed-in reader can start with no network. |

`sync.js` details:

- **One listener does both jobs.** `pull()` attaches the listener and resolves with its first
  snapshot. Later snapshots go to the handler that `follow()` registered. Two separate reads would
  charge every document twice (a listener is charged one read per document added or updated).
- **Sign-out detaches the listener.** The Supabase channel never detaches.
- **Record before sending.** A write waits offline, so `save()` marks the show as waiting first
  and clears the mark on acknowledgement. This is the reverse of today's order. The mark clears
  only when no later write for that show is queued behind the acknowledged one.
- **The masthead flickers.** Every online write is "waiting" until acknowledged, so the count shows
  1 for a moment. Show the count only after a short delay.
- **`bury()`** writes a whole tombstone with `setDoc`: `deletedAt` set, `watched` null, the rest
  empty. It needs no existing document, and it erases the stored progress.
- **The listener skips changes with `hasPendingWrites`.** Those are this device's own writes.
- **`inTurn` stays.** It also makes a queued write send the show as it stands when its turn comes.
- **Auth errors** are mapped from the codes of both the emulator and production.

Check:

- sign up, sign out and sign in again, and the library comes back;
- sign in on a second browser, mark an episode, and the first browser updates;
- mark an episode with the network off and the masthead reads "1 waiting", then restore the network
  and it reads "Synced";
- reload while signed in, and the user is still signed in;
- sign in with an existing `localStorage` library, and every show appears in Firestore.

### 4. Reset and change password (second PR)

- **"Forgot password" in the sign-in dialog.** It calls `sendPasswordResetEmail`. The message after
  it is the same whether or not the address has an account: "if that address has an account, an
  email is on its way". Pass a `continueUrl` so the reader can return to the app. Firebase hosts
  the page where they type the new password, so the app needs no router.
- **Change password while signed in.** `updatePassword`. When Firebase asks for a recent sign-in,
  ask for the current password and call `reauthenticateWithCredential`, then retry.

Check: a real reset email reaches a real inbox, the link works, and the old password stops working.

### 5. Documents

| File | Change |
| --- | --- |
| `architecture/README.md`, `README.md` | Supabase becomes Firebase. |
| `architecture/user-data.md` | The schema, the merge rules and the Keys section. The Keys section says the config object is public and the rules protect the data. |
| `architecture/offline.md` | The write-order diagram and the words "table" and "Supabase". |
| `architecture/email.md` | Rewrite. What Firebase sends, the quotas, and what is unconfirmed. |
| `architecture/roadmap.md` | History entry. |
| `TODO.md` | The "domain first" and "change a password" items. |

### 6. After the deploy

1. Export the library from the app first, as a precaution.
2. Delete the Supabase project in its dashboard. This cannot be undone, so do it only when the
   owner says so.

## Limits to watch on Spark

| | Spark allowance | Bites when |
| --- | --- | --- |
| Password reset emails | 150 a day | Rarely. A person who knows a registered address can use it up on purpose. |
| Firestore reads | 50,000 a day | Each sign-in costs one read per show. At 54 shows, about 900 sign-ins a day. |
| Firestore writes | 20,000 a day | Each mark is one write. |

At the limit, the service stops. It does not bill. For data, the library in `localStorage` and the
waiting list keep working. What the app shows for a reset past the cap is not confirmed.

## Open

- **A ticket ID** for the branch and the PR titles. The first PR breaks sign-in, so its title takes `!`.
- **The project ID and the Firestore location.** Both are set once.
- **Uncommitted work.** `architecture/email.md`, `TODO.md` and `architecture/README.md` have local
  edits. Step 5 changes them again, so commit or stash them first.
