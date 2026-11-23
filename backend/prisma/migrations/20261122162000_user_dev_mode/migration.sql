ALTER TABLE "users" ADD COLUMN "dev_mode" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "dev_mode" = true
WHERE "username" = 'jugador1';
