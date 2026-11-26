-- Campos que o lead já coleta e que passam a existir na conta após a conversão
-- (spec §11). Sem CHECK: a validação de enum fica na API, como no lead.
ALTER TABLE clients ADD COLUMN segment TEXT;
ALTER TABLE clients ADD COLUMN revenue_band TEXT;
ALTER TABLE clients ADD COLUMN employee_band TEXT;
ALTER TABLE clients ADD COLUMN neighborhood TEXT;
ALTER TABLE clients ADD COLUMN lead_source TEXT;
