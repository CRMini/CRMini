-- Lead: oportunidade de negócio ainda não qualificada como conta.
-- Cria as tabelas de referência (listas extensíveis) e a tabela raiz `leads`.
-- Sem BEGIN/COMMIT/ROLLBACK/PRAGMA: o runner (database/migrate.cjs) controla a
-- transação. DDL e seeds são idempotentes (IF NOT EXISTS / INSERT OR IGNORE),
-- então o resultado final coincide com o de um banco novo criado por init.sql.

-- Tabelas de referência (listas extensíveis pelo usuário, com seed).
CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS countries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS job_titles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seeds com ids determinísticos em slug. industries e segments começam vazias
-- (a fonte não fornece seed).
INSERT OR IGNORE INTO cities (id, name) VALUES
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
  ('city-itu', 'Itu');

INSERT OR IGNORE INTO countries (id, name) VALUES
  ('country-brasil', 'Brasil'),
  ('country-mexico', 'México');

INSERT OR IGNORE INTO job_titles (id, name) VALUES
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
  ('job-title-analista-de-dados', 'Analista de Dados');

INSERT OR IGNORE INTO lead_sources (id, name) VALUES
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
  ('lead-source-outro', 'Outro');

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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT lead_disqualification_reason_check CHECK ((status = 'Desqualificado' AND disqualification_reason IS NOT NULL) OR (status <> 'Desqualificado' AND disqualification_reason IS NULL)),
  CONSTRAINT lead_conversion_biconditional CHECK ((status = 'Qualificado') = (opportunity_id IS NOT NULL AND converted_at IS NOT NULL)),
  CONSTRAINT lead_budget_nonnegative CHECK (budget IS NULL OR (budget GLOB '[0-9]*' AND CAST(budget AS REAL) >= 0))
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_company_name_idx ON leads(company_name);
CREATE INDEX IF NOT EXISTS leads_updated_at_idx ON leads(updated_at);
-- Cada oportunidade é vinculada a no máximo um lead (apenas quando não nula).
CREATE UNIQUE INDEX IF NOT EXISTS leads_opportunity_id_uidx ON leads(opportunity_id) WHERE opportunity_id IS NOT NULL;
