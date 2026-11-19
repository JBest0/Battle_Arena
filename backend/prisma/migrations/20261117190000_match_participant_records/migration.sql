ALTER TABLE "match_participants"
  ADD COLUMN "is_personal_best" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_global_record" BOOLEAN NOT NULL DEFAULT false;
