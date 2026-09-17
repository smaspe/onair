ALTER TABLE "public"."progress"
  ADD COLUMN "marked_at" timestamp WITH time zone NOT NULL DEFAULT now();
