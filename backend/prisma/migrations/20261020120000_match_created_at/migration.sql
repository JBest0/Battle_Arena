-- Fecha de creación de la partida: permite listar las partidas abiertas más recientes.
ALTER TABLE "matches"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
