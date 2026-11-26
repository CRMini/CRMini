-- Schema PostgreSQL do CRM, aplicado por database/postgresql/migrate.cjs usando
-- CRM_POSTGRES_URL. É idempotente: usa IF NOT EXISTS (e CREATE OR REPLACE nas
-- funções) e pode ser reaplicado sem efeito colateral.
--
-- Convenções (espelham database/init.sql, o schema SQLite):
-- - IDs são UUIDs em texto gerados pela aplicação (crypto.randomUUID).
-- - Booleanos são INTEGER 0/1, com CHECK para rejeitar outros valores.
-- - Valores monetários e horas são TEXT com decimal canônico (ex.: "1234.56"),
--   preservando a precisão decimal.
-- - Datas civis (birthday, opened_at, expected_close_at, occurred_at) são TEXT
--   "YYYY-MM-DD", sem conversão de fuso.
-- - Instantes (created_at, updated_at, scheduled_at) são TEXT ISO-8601 em UTC
--   ("YYYY-MM-DDTHH:MM:SS.sssZ"), comparáveis lexicograficamente; a interface
--   apresenta no fuso America/Sao_Paulo.
-- - As chaves estrangeiras (inclusive as compostas) são verificadas nativamente
--   pelo PostgreSQL; não há PRAGMA como no SQLite.

-- Registro das migrations já aplicadas ao banco (espelha o SQLite; no PostgreSQL
-- o runner desta pasta aplica apenas este init.sql, sem migrations numeradas).
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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
  segment TEXT,
  revenue_band TEXT,
  employee_band TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  postal_code TEXT,
  street TEXT,
  street_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  lead_source TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  notes TEXT,
  logo_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Campos herdados do lead na conversão (spec §11), para bancos existentes.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS segment TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS revenue_band TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS employee_band TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_source TEXT;

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
  street TEXT,
  street_number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- D-07: bancos existentes recebem as colunas de endereço do contato.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street_number TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS complement TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS contacts_client_id_idx ON contacts(client_id);
CREATE INDEX IF NOT EXISTS clients_company_name_idx ON clients(company_name);

-- Fecha o par (contato, cliente) usado pelas FKs compostas de opportunities,
-- tasks e events. O PostgreSQL aceita um índice único como alvo de FK.
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
  opened_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD'),
  expected_close_at TEXT,
  status TEXT NOT NULL DEFAULT 'Em andamento' CHECK (status IN ('Em andamento','Desenvolvimento','Proposta','Aceite da proposta','Ganha','Perdida')),
  loss_reason TEXT CHECK (loss_reason IS NULL OR loss_reason IN ('Preço','Prazo','Tecnologia','Solução')),
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  CONSTRAINT opportunity_contact_client_fk FOREIGN KEY (contact_id, client_id) REFERENCES contacts(id, client_id) ON DELETE RESTRICT,
  CONSTRAINT opportunity_loss_reason_check CHECK ((status = 'Perdida' AND loss_reason IS NOT NULL) OR (status <> 'Perdida' AND loss_reason IS NULL)),
  -- Valores e horas de projeto não podem ser negativos. No SQLite o check usa
  -- GLOB + CAST (parse tolerante); aqui a regex exige decimal canônico, que é o
  -- único formato que a aplicação grava (ex.: "1234.56").
  CONSTRAINT opportunity_nonnegative_values CHECK (
    (value IS NULL OR value ~ '^[0-9]+(\.[0-9]+)?$') AND
    (budget IS NULL OR budget ~ '^[0-9]+(\.[0-9]+)?$') AND
    (project_hours IS NULL OR project_hours ~ '^[0-9]+(\.[0-9]+)?$')
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
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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
  occurred_at    TEXT NOT NULL CHECK (occurred_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  is_origin      INTEGER NOT NULL DEFAULT 0 CHECK (is_origin IN (0, 1)),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at     TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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

-- Tabelas de referência do Lead (listas extensíveis pelo usuário, com seed).
CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS job_titles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- Seeds com ids determinísticos em slug. industries e segments começam vazias
-- (a fonte não fornece seed).
INSERT INTO cities (id, name) VALUES
  ('city-sao-paulo', 'São Paulo'),
  ('city-santo-andre', 'Santo André'),
  ('city-sao-bernardo-do-campo', 'São Bernardo do Campo'),
  ('city-sao-caetano-do-sul', 'São Caetano do Sul'),
  ('city-diadema', 'Diadema'),
  ('city-belo-horizonte', 'Belo Horizonte'),
  ('city-canoas', 'Canoas'),
  ('city-porto-alegre', 'Porto Alegre'),
  ('city-farroupilha', 'Farroupilha'),
  ('city-bento-goncalves', 'Bento Gonçalves'),
  ('city-itu', 'Itu')
ON CONFLICT (id) DO NOTHING;

INSERT INTO countries (id, name) VALUES
  ('country-brasil', 'Brasil'),
  ('country-mexico', 'México')
ON CONFLICT (id) DO NOTHING;

INSERT INTO job_titles (id, name) VALUES
  ('job-title-ceo-diretor-presidente', 'CEO (Diretor Presidente)'),
  ('job-title-coo-diretor-de-operacoes', 'COO (Diretor de Operações)'),
  ('job-title-cfo-diretor-financeiro', 'CFO (Diretor Financeiro)'),
  ('job-title-cio-diretor-de-ti', 'CIO (Diretor de TI)'),
  ('job-title-cto-diretor-de-tecnologia', 'CTO (Diretor de Tecnologia)'),
  ('job-title-ciso-diretor-de-seguranca-da-informacao', 'CISO (Diretor de Segurança da Informação)'),
  ('job-title-gerente-geral', 'Gerente Geral'),
  ('job-title-gerente-de-ti', 'Gerente de TI'),
  ('job-title-gerente-de-infraestrutura', 'Gerente de Infraestrutura'),
  ('job-title-gerente-de-sistemas', 'Gerente de Sistemas'),
  ('job-title-gerente-de-seguranca-da-informacao', 'Gerente de Segurança da Informação'),
  ('job-title-gerente-de-projetos', 'Gerente de Projetos'),
  ('job-title-gerente-financeiro', 'Gerente Financeiro'),
  ('job-title-gerente-de-compras', 'Gerente de Compras'),
  ('job-title-gerente-de-rh', 'Gerente de RH'),
  ('job-title-gerente-comercial', 'Gerente Comercial'),
  ('job-title-gerente-de-marketing', 'Gerente de Marketing'),
  ('job-title-gerente-de-operacoes', 'Gerente de Operações'),
  ('job-title-coordenador-de-ti', 'Coordenador de TI'),
  ('job-title-coordenador-de-projetos', 'Coordenador de Projetos'),
  ('job-title-coordenador-financeiro', 'Coordenador Financeiro'),
  ('job-title-coordenador-de-compras', 'Coordenador de Compras'),
  ('job-title-coordenador-de-rh', 'Coordenador de RH'),
  ('job-title-arquiteto-de-solucoes', 'Arquiteto de Soluções'),
  ('job-title-analista-de-infraestrutura', 'Analista de Infraestrutura'),
  ('job-title-analista-de-seguranca-da-informacao', 'Analista de Segurança da Informação'),
  ('job-title-analista-financeiro', 'Analista Financeiro'),
  ('job-title-analista-de-compras', 'Analista de Compras'),
  ('job-title-analista-de-rh', 'Analista de RH'),
  ('job-title-analista-de-dados', 'Analista de Dados')
ON CONFLICT (id) DO NOTHING;

INSERT INTO lead_sources (id, name) VALUES
  ('lead-source-site', 'Site'),
  ('lead-source-linkedin', 'LinkedIn'),
  ('lead-source-indicacao-de-funcionario', 'Indicação de Funcionário'),
  ('lead-source-indicacao-de-clientes', 'Indicação de Clientes'),
  ('lead-source-indicacao-de-fornecedor', 'Indicação de Fornecedor'),
  ('lead-source-indicacao-microsoft', 'Indicação Microsoft'),
  ('lead-source-evento', 'Evento'),
  ('lead-source-webinar', 'Webinar'),
  ('lead-source-google-ads', 'Google Ads'),
  ('lead-source-parceiro', 'Parceiro'),
  ('lead-source-outbound', 'Outbound'),
  ('lead-source-e-mail-marketing', 'E-mail Marketing'),
  ('lead-source-outro', 'Outro')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  industry_id TEXT NOT NULL REFERENCES industries(id) ON DELETE RESTRICT,
  segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE RESTRICT,
  revenue_band TEXT NOT NULL CHECK (revenue_band IN ('Até R$ 10 milhões', 'R$ 10 milhões a R$ 50 milhões', 'R$ 50 milhões a R$ 100 milhões', 'R$ 100 milhões a R$ 500 milhões', 'R$ 500 milhões a R$ 1 bilhão', 'Acima de R$ 1 bilhão')),
  employee_band TEXT NOT NULL CHECK (employee_band IN ('1-50', '51-200', '201-500', '501-1.000', '+1.001')),
  street TEXT NOT NULL,
  street_number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city_id TEXT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO')),
  postal_code TEXT NOT NULL,
  country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  website TEXT,
  description TEXT,
  lead_source_id TEXT NOT NULL REFERENCES lead_sources(id) ON DELETE RESTRICT,
  lead_source_other TEXT,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_same_address INTEGER CHECK (contact_same_address IN (0, 1)),
  contact_street TEXT,
  contact_street_number TEXT,
  contact_complement TEXT,
  contact_neighborhood TEXT,
  contact_city_id TEXT REFERENCES cities(id) ON DELETE RESTRICT,
  contact_state TEXT CHECK (contact_state IN ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO')),
  contact_postal_code TEXT,
  contact_country_id TEXT REFERENCES countries(id) ON DELETE RESTRICT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_job_title_id TEXT REFERENCES job_titles(id) ON DELETE RESTRICT,
  desired_solution TEXT,
  identified_pain TEXT,
  priority TEXT CHECK (priority IN ('Baixa', 'Média', 'Alta', 'Urgente')),
  expected_timeframe TEXT CHECK (expected_timeframe IN ('Imediato', '3 meses', '6 meses', '12 meses', 'Sem Previsão')),
  budget TEXT,
  bant_budget TEXT CHECK (bant_budget IN ('Sim', 'Não', 'Em Definição')),
  bant_authority TEXT CHECK (bant_authority IN ('Sim', 'Influenciador', 'Usuário', 'Compras', 'Outro')),
  bant_authority_other TEXT,
  bant_need TEXT CHECK (bant_need IN ('Sim', 'Parcial', 'Não')),
  bant_timing TEXT CHECK (bant_timing IN ('Curto', 'Médio', 'Longo')),
  contact_history TEXT,
  communication_type TEXT CHECK (communication_type IN ('Ligação', 'E-mail', 'WhatsApp', 'Reunião', 'Demonstração')),
  next_interaction_date TEXT,
  next_interaction_time TEXT,
  status TEXT NOT NULL DEFAULT 'Novo' CHECK (status IN ('Novo', 'Em contato', 'Qualificando', 'Qualificado', 'Reunião agendada', 'Desqualificado')),
  disqualification_reason TEXT CHECK (disqualification_reason IS NULL OR disqualification_reason IN ('Orçamento', 'Prazo', 'Sem Resposta', 'Fechado com o Concorrente', 'Optou por Solução Interna', 'Sem Capacidade de Entrega', 'Dados Inválidos')),
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE RESTRICT,
  converted_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  CONSTRAINT lead_disqualification_reason_check CHECK ((status = 'Desqualificado' AND disqualification_reason IS NOT NULL) OR (status <> 'Desqualificado' AND disqualification_reason IS NULL)),
  CONSTRAINT lead_conversion_biconditional CHECK ((status = 'Qualificado') = (opportunity_id IS NOT NULL AND converted_at IS NOT NULL)),
  -- Budget não pode ser negativo. No SQLite o check usa GLOB + CAST (parse
  -- tolerante); aqui a regex exige decimal canônico, como em opportunities.
  CONSTRAINT lead_budget_nonnegative CHECK (budget IS NULL OR budget ~ '^[0-9]+(\.[0-9]+)?$')
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_company_name_idx ON leads(company_name);
CREATE INDEX IF NOT EXISTS leads_updated_at_idx ON leads(updated_at);
-- Cada oportunidade é vinculada a no máximo um lead (apenas quando não nula).
CREATE UNIQUE INDEX IF NOT EXISTS leads_opportunity_id_uidx ON leads(opportunity_id) WHERE opportunity_id IS NOT NULL;

-- Reproduz normalizeSearch (src/lib/normalize-search.ts): minúsculas e remoção
-- de acentos. Usa translate sobre os caracteres pré-compostos do Latin-1; a
-- versão JS usa NFD + remoção de diacríticos, equivalente para o português.
-- Entrada NULL devolve NULL, como normalizeSearch.
CREATE OR REPLACE FUNCTION crm_normalize(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(translate(value,
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN'))
$$;

-- Reproduz phoneDigits (src/lib/phone.ts): mantém apenas os dígitos.
-- Entrada NULL ou vazia devolve string vazia, como phoneDigits.
CREATE OR REPLACE FUNCTION crm_phone_digits(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(COALESCE(value, ''), '\D', '', 'g')
$$;
