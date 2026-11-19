-- Escenario en el que se juega la partida (id del catálogo de escenarios; las partidas
-- anteriores quedan en NULL y se juegan en el campo abierto).
ALTER TABLE "matches" ADD COLUMN "scenario_id" VARCHAR(50);
