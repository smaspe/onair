SET local check_function_bodies = off;

CREATE TABLE "public"."progress" (
  "user_id"    uuid                     NOT NULL,
  "show_id"    integer                  NOT NULL,
  "imdb_id"    text,
  "season"     integer                  NOT NULL,
  "episode"    integer                  NOT NULL,
  "rating"     integer,
  "dropped"    boolean                  NOT NULL DEFAULT false,
  "deleted_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "progress_pkey" PRIMARY KEY (user_id, show_id)
);

ALTER TABLE "public"."progress"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end $function$;

ALTER TABLE "public"."progress"
  ADD CONSTRAINT "progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE TRIGGER progress_touch
  BEFORE INSERT OR UPDATE ON public.progress
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "own_rows" ON "public"."progress"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."progress";

GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO PUBLIC, "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."progress" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."progress" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."progress" TO "service_role";
