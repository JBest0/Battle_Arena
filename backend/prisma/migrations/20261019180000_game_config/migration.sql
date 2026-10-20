-- Configuración de la partida (modo de fin, duración, puntos objetivo, cupo) y creador.
ALTER TABLE "matches"
  ADD COLUMN "max_players" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "duration_seconds" INTEGER,
  ADD COLUMN "target_points" INTEGER,
  ADD COLUMN "created_by_id" UUID;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
