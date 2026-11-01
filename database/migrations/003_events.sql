-- @applied-if: SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'
-- Fecha o par (oportunidade, cliente) usado pela FK composta de events.
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_id_client_id_uidx
  ON opportunities(id, client_id);

-- Histórico: eventos são fatos passados do relacionamento, com vínculo opcional
-- a uma oportunidade e a um contato do mesmo cliente.
CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  opportunity_id TEXT,
  contact_id     TEXT,
  event_type     TEXT NOT NULL CHECK (event_type IN ('reuniao','ligacao','email','mensagem','nota')),
  title          TEXT NOT NULL CHECK (length(trim(title)) > 0),
  details        TEXT,
  occurred_at    TEXT NOT NULL CHECK (occurred_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  is_origin      INTEGER NOT NULL DEFAULT 0 CHECK (is_origin IN (0, 1)),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT event_contact_client_fk FOREIGN KEY (contact_id, client_id)
    REFERENCES contacts(id, client_id) ON DELETE RESTRICT,
  CONSTRAINT event_opportunity_client_fk FOREIGN KEY (opportunity_id, client_id)
    REFERENCES opportunities(id, client_id) ON DELETE RESTRICT,
  CONSTRAINT event_origin_requires_opportunity
    CHECK (is_origin = 0 OR opportunity_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS events_client_id_idx
  ON events(client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS events_opportunity_id_idx
  ON events(opportunity_id, occurred_at DESC);
-- Garante no máximo um evento de origem por oportunidade.
CREATE UNIQUE INDEX IF NOT EXISTS events_origin_opportunity_uidx
  ON events(opportunity_id) WHERE is_origin = 1;
