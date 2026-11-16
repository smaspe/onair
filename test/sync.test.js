import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { sync } from "../worker/sync.js";
import { openDatabase } from "./d1.js";

const ALICE = "0123456789ABCDEFGHJKMNPQR";
const BOB = "ZYXWVTSRQPNMKJHGFEDCBA987";

const libraryOf = (code) => createHash("sha256").update(code).digest("hex");

// One request to the sync routes. Every answer must tell every cache to store nothing, so that
// is checked here, for every request a test makes.
const call = async (binding, method, path, { code = ALICE, body } = {}) => {
  const response = await sync(
    new Request(`https://onair.test${path}`, {
      method,
      headers: code ? { authorization: `Bearer ${code}` } : {},
      body: typeof body === "object" ? JSON.stringify(body) : body,
    }),
    binding,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { status: response.status, ...(await response.json()) };
};

const progress = (fields = {}) => ({
  base: null,
  watched: { 1: [1, 2] },
  markedAt: "2026-11-16T20:00:00.000Z",
  rating: 8,
  dropped: false,
  ...fields,
});

test("a library with no row answers with no row", async () => {
  const { binding } = openDatabase();

  assert.deepEqual(await call(binding, "GET", "/api/sync"), { status: 200, rows: [] });
});

test("a row that is written is the row that is read", async () => {
  const { binding } = openDatabase();

  const written = await call(binding, "PUT", "/api/sync/1399", { body: progress() });

  assert.equal(written.status, 200);
  assert.deepEqual(written.row, {
    id: 1399,
    watched: { 1: [1, 2] },
    markedAt: "2026-11-16T20:00:00.000Z",
    rating: 8,
    dropped: false,
    deleted: false,
    updatedAt: written.row.updatedAt,
  });
  assert.equal(typeof written.row.updatedAt, "number");
  assert.deepEqual((await call(binding, "GET", "/api/sync")).rows, [written.row]);
});

test("the episodes of a season are stored once each, in order", async () => {
  const { binding } = openDatabase();

  const { row } = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ watched: { 2: [3, 1, 3], 1: [] } }),
  });

  assert.deepEqual(row.watched, { 2: [1, 3] });
});

test("the row is stored under the SHA-256 of the code, and the code is not stored", async () => {
  const { binding, sqlite } = openDatabase();

  await call(binding, "PUT", "/api/sync/1399", { body: progress() });

  const stored = sqlite.prepare("select * from progress").all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].library, libraryOf(ALICE));
  assert.ok(!JSON.stringify(stored).includes(ALICE));
});

test("a code reads and writes the rows of its own library only", async () => {
  const { binding } = openDatabase();
  const { row: hers } = await call(binding, "PUT", "/api/sync/1399", { body: progress() });

  assert.deepEqual((await call(binding, "GET", "/api/sync", { code: BOB })).rows, []);

  // The same show id in another library is another row: no conflict, and nothing of hers moves.
  const his = await call(binding, "PUT", "/api/sync/1399", {
    code: BOB,
    body: progress({ watched: { 5: [9] }, rating: 2 }),
  });
  assert.equal(his.status, 200);
  assert.deepEqual((await call(binding, "GET", "/api/sync", { code: BOB })).rows, [his.row]);
  assert.deepEqual((await call(binding, "GET", "/api/sync")).rows, [hers]);

  // His tombstone removes his row and not hers.
  await call(binding, "PUT", "/api/sync/1399", {
    code: BOB,
    body: { base: his.row.updatedAt, deleted: true },
  });
  assert.deepEqual((await call(binding, "GET", "/api/sync")).rows, [hers]);
});

test("a write that states the value it last saw replaces the row", async () => {
  const { binding } = openDatabase();
  const first = await call(binding, "PUT", "/api/sync/1399", { body: progress() });

  const second = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ base: first.row.updatedAt, watched: { 1: [1, 2, 3] } }),
  });

  assert.equal(second.status, 200);
  assert.deepEqual(second.row.watched, { 1: [1, 2, 3] });
  assert.ok(second.row.updatedAt > first.row.updatedAt);
});

test("a write that states an older value is refused with the row as it is", async () => {
  const { binding } = openDatabase();
  const first = await call(binding, "PUT", "/api/sync/1399", { body: progress() });
  const second = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ base: first.row.updatedAt, rating: 9 }),
  });

  const stale = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ base: first.row.updatedAt, rating: 1 }),
  });

  assert.deepEqual(stale, { status: 409, row: second.row });
  assert.deepEqual((await call(binding, "GET", "/api/sync")).rows, [second.row]);
});

test("a write that states no value is refused when the row exists", async () => {
  const { binding } = openDatabase();
  const first = await call(binding, "PUT", "/api/sync/1399", { body: progress() });

  const blind = await call(binding, "PUT", "/api/sync/1399", { body: progress({ rating: 1 }) });

  assert.deepEqual(blind, { status: 409, row: first.row });
});

test("a removed show keeps a row that says so", async () => {
  const { binding } = openDatabase();
  const first = await call(binding, "PUT", "/api/sync/1399", { body: progress() });

  const removed = await call(binding, "PUT", "/api/sync/1399", {
    body: { base: first.row.updatedAt, deleted: true },
  });

  assert.equal(removed.status, 200);
  assert.deepEqual(removed.row, {
    id: 1399,
    watched: {},
    markedAt: null,
    rating: null,
    dropped: false,
    deleted: true,
    updatedAt: removed.row.updatedAt,
  });
  assert.deepEqual((await call(binding, "GET", "/api/sync")).rows, [removed.row]);
});

test("a show that was removed is written again over its tombstone", async () => {
  const { binding } = openDatabase();
  const first = await call(binding, "PUT", "/api/sync/1399", { body: progress() });
  const removed = await call(binding, "PUT", "/api/sync/1399", {
    body: { base: first.row.updatedAt, deleted: true },
  });

  const back = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ base: removed.row.updatedAt }),
  });

  assert.equal(back.status, 200);
  assert.equal(back.row.deleted, false);
});

test("a request with no valid code is refused", async () => {
  const { binding } = openDatabase();

  for (const code of [
    null,
    ALICE.toLowerCase(),
    ALICE.slice(1),
    `${ALICE}0`,
    `U${ALICE.slice(1)}`,
    `${ALICE.slice(0, 5)}-${ALICE.slice(5)}`,
  ])
    assert.equal((await call(binding, "GET", "/api/sync", { code })).status, 401, code);
});

test("a body in the wrong shape is refused", async () => {
  const { binding } = openDatabase();

  for (const body of [
    "not json",
    "null",
    "[]",
    progress({ base: "1" }),
    progress({ base: -1 }),
    progress({ watched: null }),
    progress({ watched: [1, 2] }),
    progress({ watched: { one: [1] } }),
    progress({ watched: { 1: 3 } }),
    progress({ watched: { 1: ["2"] } }),
    progress({ watched: { 1: [0] } }),
    progress({ watched: { 1: [1.5] } }),
    progress({ rating: 0 }),
    progress({ rating: 11 }),
    progress({ rating: 7.5 }),
    progress({ rating: "8" }),
    progress({ dropped: 1 }),
    progress({ markedAt: "yesterday" }),
    progress({ markedAt: 1731787200000 }),
    { base: null, deleted: "yes" },
  ]) {
    const refused = await call(binding, "PUT", "/api/sync/1399", { body });
    assert.equal(refused.status, 400, JSON.stringify(body));
  }
  assert.deepEqual((await call(binding, "GET", "/api/sync")).rows, []);
});

test("a show with no mark and no rating is accepted", async () => {
  const { binding } = openDatabase();

  const { status, row } = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ watched: {}, markedAt: null, rating: null, dropped: true }),
  });

  assert.equal(status, 200);
  assert.deepEqual(
    { watched: row.watched, markedAt: row.markedAt, rating: row.rating, dropped: row.dropped },
    { watched: {}, markedAt: null, rating: null, dropped: true },
  );
});

test("a body over 32 KB is refused", async () => {
  const { binding } = openDatabase();
  const episodes = (count) => Array.from({ length: count }, (_, at) => at + 1);

  const large = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ watched: { 1: episodes(9000) } }),
  });
  const long = await call(binding, "PUT", "/api/sync/1399", {
    body: progress({ watched: { 1: episodes(5000) } }),
  });

  assert.equal(large.status, 413);
  assert.equal(long.status, 200);
});

test("a library takes 1,000 rows and no more", async () => {
  const { binding, sqlite } = openDatabase();
  const insert = sqlite.prepare(
    "insert into progress (library, show_id, updated_at) values (?, ?, 1)",
  );
  for (let id = 1; id <= 1000; id += 1) insert.run(libraryOf(ALICE), id);

  const extra = await call(binding, "PUT", "/api/sync/1001", { body: progress() });
  const held = await call(binding, "PUT", "/api/sync/1000", { body: progress({ base: 1 }) });
  const other = await call(binding, "PUT", "/api/sync/1001", { code: BOB, body: progress() });

  assert.equal(extra.status, 507);
  assert.equal(held.status, 200);
  assert.equal(other.status, 200);
});

test("anything that is not one of the two routes is refused", async () => {
  const { binding } = openDatabase();
  const put = (path) => call(binding, "PUT", path, { body: progress() });

  assert.equal((await call(binding, "GET", "/api/sync?since=1")).status, 404);
  assert.equal((await put("/api/sync/1399?base=1")).status, 404);
  assert.equal((await put("/api/sync/")).status, 404);
  assert.equal((await put("/api/sync/abc")).status, 404);
  assert.equal((await put("/api/sync/1234567890")).status, 404);
  assert.equal((await put("/api/sync/1399/watched")).status, 404);
  assert.equal((await put("/api/sync")).status, 405);
  assert.equal((await call(binding, "DELETE", "/api/sync")).status, 405);
  assert.equal((await call(binding, "GET", "/api/sync/1399")).status, 405);
  assert.equal((await call(binding, "DELETE", "/api/sync/1399")).status, 405);
});

test("a database that fails gives an answer that no cache stores", async () => {
  const failing = {
    prepare: () => {
      throw new Error("D1 is over its daily limit");
    },
  };

  assert.equal((await call(failing, "GET", "/api/sync")).status, 500);
});
