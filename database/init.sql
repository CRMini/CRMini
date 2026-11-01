-- Schema SQLite do CRM, aplicado automaticamente na abertura do banco local
-- (ver src/lib/db.ts). É idempotente: usa IF NOT EXISTS e pode ser reaplicado.
--
-- Convenções:
-- - IDs são UUIDs em texto gerados pela aplicação (crypto.randomUUID).
-- - Booleanos são INTEGER 0/1 (o SQLite não tem tipo booleano nativo).
-- - Valores monetários e horas são TEXT com decimal canônico (ex.: "1234.56"),
--   preservando a precisão decimal que o NUMERIC do PostgreSQL garantia.
-- - Datas civis (birthday, opened_at, expected_close_at) são TEXT "YYYY-MM-DD",
--   sem conversão de fuso.
-- - Instantes (created_at, updated_at, scheduled_at) são TEXT ISO-8601 em UTC
--   ("YYYY-MM-DDTHH:MM:SS.sssZ"), comparáveis lexicograficamente; a interface
--   apresenta no fuso America/Sao_Paulo.
-- - As chaves estrangeiras são verificadas porque cada conexão executa
--   PRAGMA foreign_keys = ON (ver src/lib/db.ts).

-- Registro das migrations já aplicadas ao banco (ver database/migrate.cjs).
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Preferências do aplicativo em pares chave/valor (por exemplo, user_name).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  trade_name TEXT,
  tax_id TEXT,
  industry TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  postal_code TEXT,
  street TEXT,
  street_number TEXT,
  complement TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  notes TEXT,
  logo_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  birthday TEXT,
  linkedin_url TEXT,
  notes TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS contacts_client_id_idx ON contacts(client_id);
CREATE INDEX IF NOT EXISTS clients_company_name_idx ON clients(company_name);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_id_client_id_uidx ON contacts(id, client_id);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contact_id TEXT NOT NULL,
  technology TEXT,
  value TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL','USD','EUR','PES')),
  service_type TEXT,
  resources TEXT,
  budget TEXT,
  budget_currency TEXT CHECK (budget_currency IS NULL OR budget_currency IN ('BRL','USD','EUR','PES')),
  notes TEXT,
  customer_need TEXT,
  offered_solution TEXT,
  project_hours TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_DATE,
  expected_close_at TEXT,
  status TEXT NOT NULL DEFAULT 'Em andamento' CHECK (status IN ('Em andamento','Desenvolvimento','Proposta','Aceite da proposta','Ganha','Perdida')),
  loss_reason TEXT CHECK (loss_reason IS NULL OR loss_reason IN ('Preço','Prazo','Tecnologia','Solução')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT opportunity_contact_client_fk FOREIGN KEY (contact_id, client_id) REFERENCES contacts(id, client_id) ON DELETE RESTRICT,
  CONSTRAINT opportunity_loss_reason_check CHECK ((status = 'Perdida' AND loss_reason IS NOT NULL) OR (status <> 'Perdida' AND loss_reason IS NULL)),
  CONSTRAINT opportunity_nonnegative_values CHECK (
    (value IS NULL OR (value GLOB '[0-9]*' AND CAST(value AS REAL) >= 0)) AND
    (budget IS NULL OR (budget GLOB '[0-9]*' AND CAST(budget AS REAL) >= 0)) AND
    (project_hours IS NULL OR (project_hours GLOB '[0-9]*' AND CAST(project_hours AS REAL) >= 0))
  )
);
CREATE INDEX IF NOT EXISTS opportunities_client_id_idx ON opportunities(client_id);
CREATE INDEX IF NOT EXISTS opportunities_status_idx ON opportunities(status);

-- Fecha o par (oportunidade, cliente) usado pela FK composta de events.
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_id_client_id_uidx ON opportunities(id, client_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('email','telefone','compromisso')),
  subject TEXT NOT NULL CHECK (length(trim(subject)) > 0),
  description TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Aberto' CHECK (status IN ('Aberto','Concluído')),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contact_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT task_contact_client_fk FOREIGN KEY (contact_id, client_id) REFERENCES contacts(id, client_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS tasks_scheduled_at_idx ON tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON tasks(client_id);

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
