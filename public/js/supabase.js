// Pinned: a version range is served with a ten minute cache, an exact one for a year.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";

// The publishable key names the project and carries no permission of its own. Row level
// security decides what a request may read and write, so this key is safe to serve to every
// visitor. See architecture/user-data.md.
export const supabase = createClient(
  "https://qovnagiszinlckjgnkds.supabase.co",
  "sb_publishable_BgJIAWUicO27CGPB45wswg__YhuiOwA",
);
