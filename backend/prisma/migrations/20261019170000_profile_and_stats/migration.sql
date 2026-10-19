-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "last_login_at" TIMESTAMP(3),
  ALTER COLUMN "display_name" TYPE VARCHAR(40),
  ALTER COLUMN "bio" TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "matches" ADD COLUMN "stats_recorded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "match_participants" ADD COLUMN "result" "MatchResult";

-- AlterTable
ALTER TABLE "achievements" ADD COLUMN "icon" TEXT;

-- CreateIndex
CREATE INDEX "player_stats_ranking_points_idx" ON "player_stats"("ranking_points");

-- CreateIndex
CREATE INDEX "match_participants_user_id_idx" ON "match_participants"("user_id");

-- CreateIndex
CREATE INDEX "matches_ended_at_idx" ON "matches"("ended_at");
