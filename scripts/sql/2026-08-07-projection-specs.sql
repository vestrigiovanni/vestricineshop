-- Specifiche di proiezione + librerie Plex di appartenenza.
--
-- Additivo e ripetibile: aggiunge tre colonne e non tocca niente di esistente.
-- Va applicato PRIMA di mandare in produzione il codice che le legge, altrimenti
-- ogni query su PretixSync e CatalogFilm fallisce per colonna mancante.
--
--   psql "$DATABASE_URL" -f scripts/sql/2026-08-07-projection-specs.sql

ALTER TABLE "PretixSync" ADD COLUMN IF NOT EXISTS "projectionSpecs" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "PretixSync" ADD COLUMN IF NOT EXISTS "projectionSpecsNote" text;

ALTER TABLE "CatalogFilm" ADD COLUMN IF NOT EXISTS "plexLibraries" text[] NOT NULL DEFAULT '{}';
