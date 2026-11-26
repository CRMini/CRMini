-- D-07: o contato passa a guardar o próprio endereço, usado na conversão do
-- lead e no cadastro de contato. Colunas opcionais: contatos antigos ficam
-- com endereço vazio, como já acontecia na interface.
ALTER TABLE contacts ADD COLUMN street TEXT;
ALTER TABLE contacts ADD COLUMN street_number TEXT;
ALTER TABLE contacts ADD COLUMN complement TEXT;
ALTER TABLE contacts ADD COLUMN neighborhood TEXT;
ALTER TABLE contacts ADD COLUMN city TEXT;
ALTER TABLE contacts ADD COLUMN state TEXT;
ALTER TABLE contacts ADD COLUMN postal_code TEXT;
ALTER TABLE contacts ADD COLUMN country TEXT;
