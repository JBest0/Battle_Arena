-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
