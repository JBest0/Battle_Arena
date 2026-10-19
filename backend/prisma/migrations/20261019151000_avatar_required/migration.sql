-- Backfill: todo usuario debe tener un avatar (CA-06.1)
UPDATE "users"
SET "avatar_id" = (
  SELECT "id" FROM "avatars"
  WHERE "type" = 'DEFAULT'
  ORDER BY "url"
  LIMIT 1
)
WHERE "avatar_id" IS NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "avatar_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_avatar_id_fkey";

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_fkey" FOREIGN KEY ("avatar_id") REFERENCES "avatars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
