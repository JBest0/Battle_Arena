ALTER TABLE "users"
ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_identities_user_id_idx"
ON "external_identities"("user_id");

CREATE UNIQUE INDEX "external_identities_provider_provider_user_id_key"
ON "external_identities"("provider", "provider_user_id");

ALTER TABLE "external_identities"
ADD CONSTRAINT "external_identities_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
