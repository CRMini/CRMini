/**
 * Listas de referência extensíveis da feature de leads ("adicionar opção").
 *
 * O mapa existe para que o nome da tabela nunca venha de dados recebidos do
 * cliente: a rota valida o tipo com `isLeadReferenceType` e o repositório só
 * consegue resolver tabelas presentes neste literal.
 */
export const LEAD_REFERENCE_TABLES = {
  industries: "industries",
  segments: "segments",
  cities: "cities",
  countries: "countries",
  job_titles: "job_titles",
  lead_sources: "lead_sources",
} as const;

export type LeadReferenceType = keyof typeof LEAD_REFERENCE_TABLES;

export type LeadReference = { id: string; name: string };

export const LEAD_REFERENCE_TYPES = Object.keys(
  LEAD_REFERENCE_TABLES,
) as LeadReferenceType[];

export function isLeadReferenceType(
  value: string,
): value is LeadReferenceType {
  return Object.hasOwn(LEAD_REFERENCE_TABLES, value);
}

/**
 * Ordenação alfabética em português, independente do driver. O SQLite sem
 * collation ordena por byte, o que joga "Água" para o fim da lista; para as
 * duas implementações darem o mesmo resultado, a ordenação fica no JS.
 */
export function sortLeadReferences(rows: LeadReference[]): LeadReference[] {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}
