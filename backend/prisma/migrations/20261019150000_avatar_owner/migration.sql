-- AlterTable
ALTER TABLE "avatars" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "avatars_owner_id_idx" ON "avatars"("owner_id");
