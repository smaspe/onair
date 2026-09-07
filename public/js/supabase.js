// The client, fetched the first time something wants it rather than when this module loads.
// A static import puts the whole Supabase dependency graph in front of the first paint — 17
// requests, some of them serial — for a reader who may never sign in.
//
// Pinned: a version range is served with a ten minute cache, an exact one for a year.
//
// `standalone` asks esm.sh for the library and its dependencies as one file. Without it the
// import fans out into seventeen requests, some of them serial, and one of them is a stub for
// a dependency that Supabase names by range and that therefore caches for ten minutes.
const LIBRARY = "https://esm.sh/@supabase/supabase-js@2.115.0?standalone";

// The publishable key names the project and carries no permission of its own. Row level
// security decides what a request may read and write, so this key is safe to serve to every
// visitor. See architecture/user-data.md.
const PROJECT = "https://qovnagiszinlckjgnkds.supabase.co";
const KEY = "sb_publishable_BgJIAWUicO27CGPB45wswg__YhuiOwA";

let held;

export const client = () =>
  (held ??= import(LIBRARY).then(({ createClient }) => createClient(PROJECT, KEY)));
