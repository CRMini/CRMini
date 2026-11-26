import { isValidCnpj, normalizeCnpj } from "@/lib/cnpj";
import { validateOpportunityFields } from "@/lib/opportunity-validation";
import { isValidEmail } from "@/lib/email";
import {
  canTransitionLeadStatus,
  isLeadDisqualificationReason,
  isLeadStatus,
  type LeadStatus,
} from "@/lib/lead-status";

/**
 * Regras de criação de lead no nível de domínio (usadas pela API, não pela tela).
 *
 * A validação devolve a primeira mensagem de erro encontrada, no mesmo contrato
 * de `validateTask`. Campos opcionais vazios são tratados como ausentes para
 * que o formulário possa enviar string vazia sem gravar dado em branco.
 */

export const REVENUE_BANDS = [
  "Até R$ 10 milhões",
  "R$ 10 milhões a R$ 50 milhões",
  "R$ 50 milhões a R$ 100 milhões",
  "R$ 100 milhões a R$ 500 milhões",
  "R$ 500 milhões a R$ 1 bilhão",
  "Acima de R$ 1 bilhão",
] as const;

export const EMPLOYEE_BANDS = [
  "1-50",
  "51-200",
  "201-500",
  "501-1.000",
  "+1.001",
] as const;

export const LEAD_PRIORITIES = ["Baixa", "Média", "Alta", "Urgente"] as const;

export const LEAD_TIMEFRAMES = [
  "Imediato",
  "3 meses",
  "6 meses",
  "12 meses",
  "Sem Previsão",
] as const;

export const BANT_BUDGET_VALUES = ["Sim", "Não", "Em Definição"] as const;
export const BANT_AUTHORITY_VALUES = [
  "Sim",
  "Influenciador",
  "Usuário",
  "Compras",
  "Outro",
] as const;
export const BANT_NEED_VALUES = ["Sim", "Parcial", "Não"] as const;
export const BANT_TIMING_VALUES = ["Curto", "Médio", "Longo"] as const;

export const COMMUNICATION_TYPES = [
  "Ligação",
  "E-mail",
  "WhatsApp",
  "Reunião",
  "Demonstração",
] as const;

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

/** Id fixo da opção "Outro" em `lead_sources` (vem do seed da migration 004). */
export const OTHER_LEAD_SOURCE_ID = "lead-source-outro";

/** Colunas gravadas na criação, na ordem usada pelos dois provedores. */
export const LEAD_WRITE_COLUMNS = [
  "company_name",
  "trade_name",
  "tax_id",
  "industry_id",
  "segment_id",
  "revenue_band",
  "employee_band",
  "street",
  "street_number",
  "complement",
  "neighborhood",
  "city_id",
  "state",
  "postal_code",
  "country_id",
  "website",
  "description",
  "lead_source_id",
  "lead_source_other",
  "contact_first_name",
  "contact_last_name",
  "contact_same_address",
  "contact_street",
  "contact_street_number",
  "contact_complement",
  "contact_neighborhood",
  "contact_city_id",
  "contact_state",
  "contact_postal_code",
  "contact_country_id",
  "contact_email",
  "contact_phone",
  "contact_job_title_id",
  "desired_solution",
  "identified_pain",
  "priority",
  "expected_timeframe",
  "budget",
  "bant_budget",
  "bant_authority",
  "bant_authority_other",
  "bant_need",
  "bant_timing",
  "contact_history",
  "communication_type",
  "next_interaction_date",
  "next_interaction_time",
  "status",
] as const;

export type LeadWriteColumn = (typeof LEAD_WRITE_COLUMNS)[number];

const REQUIRED_TEXT_FIELDS: Array<[LeadWriteColumn, string]> = [
  ["company_name", "Informe a razão social."],
  ["trade_name", "Informe o nome fantasia."],
  ["street", "Informe o endereço."],
  ["street_number", "Informe o número do endereço."],
  ["neighborhood", "Informe o bairro."],
  ["city_id", "Selecione a cidade."],
  ["country_id", "Selecione o país."],
  ["industry_id", "Selecione o setor de atuação."],
  ["segment_id", "Selecione o segmento."],
  ["lead_source_id", "Selecione a origem do lead."],
];

const OPTIONAL_TEXT_FIELDS: LeadWriteColumn[] = [
  "complement",
  "website",
  "description",
  "lead_source_other",
  "contact_first_name",
  "contact_last_name",
  "contact_street",
  "contact_street_number",
  "contact_complement",
  "contact_neighborhood",
  "contact_city_id",
  "contact_postal_code",
  "contact_country_id",
  "contact_email",
  "contact_phone",
  "contact_job_title_id",
  "desired_solution",
  "identified_pain",
  "bant_authority_other",
  "contact_history",
];

const CONTACT_ADDRESS_FIELDS: Array<[LeadWriteColumn, string]> = [
  ["contact_street", "Informe o endereço do contato."],
  ["contact_street_number", "Informe o número do endereço do contato."],
  ["contact_neighborhood", "Informe o bairro do contato."],
  ["contact_city_id", "Selecione a cidade do contato."],
  ["contact_state", "Selecione o estado do contato."],
  ["contact_postal_code", "Informe o CEP do contato."],
  ["contact_country_id", "Selecione o país do contato."],
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Campos opcionais chegam do formulário como string vazia, não como nulo. */
function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function isOneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function isValidCivilDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Valida o corpo de criação de um lead. Retorna a mensagem de erro ou `null`.
 * O status nunca é aceito no corpo: todo lead nasce em `Novo`.
 */
export function validateLeadCreation(
  body: Record<string, unknown>,
): string | null {
  if ("status" in body && body.status !== "Novo")
    return "Todo lead é criado com o status Novo.";
  if ("disqualification_reason" in body && body.disqualification_reason)
    return "O motivo de desqualificação só existe em lead desqualificado.";
  if ("opportunity_id" in body && body.opportunity_id)
    return "Um lead novo não pode estar vinculado a uma oportunidade.";
  if ("converted_at" in body && body.converted_at)
    return "Um lead novo não pode estar convertido.";

  return validateLeadFields(body);
}

/** Campos comuns à criação e à edição. */
export function validateLeadFields(
  body: Record<string, unknown>,
): string | null {
  for (const [field, message] of REQUIRED_TEXT_FIELDS) {
    if (!text(body[field])) return message;
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== "string")
      return "Dados inválidos para o lead.";
  }

  const cnpj = text(body.tax_id);
  if (!cnpj) return "Informe o CNPJ.";
  if (!isValidCnpj(cnpj)) return "CNPJ inválido. Informe os 14 dígitos.";

  if (!isOneOf(REVENUE_BANDS, body.revenue_band))
    return "Selecione uma faixa de faturamento válida.";
  if (!isOneOf(EMPLOYEE_BANDS, body.employee_band))
    return "Selecione uma faixa de número de funcionários válida.";
  if (!isOneOf(BRAZILIAN_STATES, body.state))
    return "Selecione um estado válido.";

  const postalCode = text(body.postal_code);
  if (!postalCode) return "Informe o CEP.";
  if (digits(postalCode).length !== 8)
    return "CEP inválido. Informe os 8 dígitos.";

  if (body.contact_same_address !== undefined) {
    const sameAddress = body.contact_same_address;
    if (sameAddress !== true && sameAddress !== false && sameAddress !== 0 && sameAddress !== 1)
      return "Informe se o endereço do contato é o mesmo da empresa.";
  }

  const contactEmail = text(body.contact_email);
  if (contactEmail && !isValidEmail(contactEmail))
    return "E-mail do contato inválido.";

  if (!isBlank(body.communication_type)) {
    if (!isOneOf(COMMUNICATION_TYPES, body.communication_type))
      return "Selecione um tipo de interação válido.";
  }

  if (!isBlank(body.priority)) {
    if (!isOneOf(LEAD_PRIORITIES, body.priority))
      return "Selecione uma prioridade válida.";
  }

  if (!isBlank(body.expected_timeframe)) {
    if (!isOneOf(LEAD_TIMEFRAMES, body.expected_timeframe))
      return "Selecione uma previsão de prazo válida.";
  }

  for (const [field, values, message] of [
    ["bant_budget", BANT_BUDGET_VALUES, "Selecione uma opção de orçamento (BANT) válida."],
    ["bant_authority", BANT_AUTHORITY_VALUES, "Selecione uma opção de decisor (BANT) válida."],
    ["bant_need", BANT_NEED_VALUES, "Selecione uma opção de necessidade (BANT) válida."],
    ["bant_timing", BANT_TIMING_VALUES, "Selecione uma opção de prazo de compra (BANT) válida."],
  ] as const) {
    const value = body[field];
    if (!isBlank(value) && !isOneOf(values, value)) return message;
  }

  const budget = text(body.budget);
  if (budget && !DECIMAL_PATTERN.test(budget))
    return "Budget inválido. Use um valor em reais, sem separador de milhar.";

  const nextInteractionDate = text(body.next_interaction_date);
  if (nextInteractionDate && !isValidCivilDate(nextInteractionDate))
    return "Data da próxima interação inválida.";

  const nextInteractionTime = text(body.next_interaction_time);
  if (nextInteractionTime && !TIME_PATTERN.test(nextInteractionTime))
    return "Hora da próxima interação inválida.";

  const sameAddress =
    body.contact_same_address === 0 || body.contact_same_address === false;
  if (sameAddress) {
    for (const [field, message] of CONTACT_ADDRESS_FIELDS) {
      if (!text(body[field])) return message;
    }
  }

  if (body.contact_state !== undefined && body.contact_state !== null) {
    const contactState = text(body.contact_state);
    if (contactState && !isOneOf(BRAZILIAN_STATES, contactState))
      return "Selecione um estado válido para o contato.";
  }

  const contactPostalCode = text(body.contact_postal_code);
  if (contactPostalCode && digits(contactPostalCode).length !== 8)
    return "CEP do contato inválido. Informe os 8 dígitos.";

  const source = text(body.lead_source_id);
  if (source === OTHER_LEAD_SOURCE_ID) {
    if (!text(body.lead_source_other))
      return "Descreva a origem do lead quando escolher Outro.";
  } else if (text(body.lead_source_other)) {
    return "A descrição da origem só se aplica à opção Outro.";
  }

  if (body.bant_authority === "Outro") {
    if (!text(body.bant_authority_other))
      return "Descreva o decisor quando escolher Outro.";
  } else if (text(body.bant_authority_other)) {
    return "A descrição do decisor só se aplica à opção Outro.";
  }

  return null;
}

/**
 * Valida a edição de um lead. Os campos são os mesmos da criação; o status só
 * pode mudar por transição permitida, e `Qualificado` nunca é escolha manual.
 */
export function validateLeadUpdate(
  current: { status: LeadStatus },
  body: Record<string, unknown>,
): string | null {
  const fieldsError = validateLeadFields(body);
  if (fieldsError) return fieldsError;

  if (typeof body.status !== "string" || !isLeadStatus(body.status))
    return "Selecione um status válido.";
  const status = body.status;

  if (
    status !== current.status &&
    !canTransitionLeadStatus(current.status, status)
  )
    return "Essa mudança de status não é permitida.";

  if (status === "Desqualificado") {
    const reason = text(body.disqualification_reason);
    if (!reason) return "Selecione o motivo da desqualificação.";
    if (!isLeadDisqualificationReason(reason))
      return "Motivo de desqualificação inválido.";
  } else if (text(body.disqualification_reason)) {
    return "O motivo de desqualificação só existe em lead desqualificado.";
  }

  return null;
}

/**
 * Pré-condições da conversão (D-09/D-10): o lead precisa estar em contato ou
 * em qualificação e ter nome e e-mail de contato, porque `contacts.full_name`
 * é obrigatório. A oportunidade é validada como na criação direta.
 */
export function validateLeadConversion(
  lead: Record<string, unknown>,
  opportunity: Record<string, unknown>,
): string | null {
  if (lead.status !== "Em contato" && lead.status !== "Qualificando")
    return "Só é possível converter leads em Em contato ou Qualificando.";
  if (!text(lead.contact_first_name))
    return "Informe o nome do contato antes de converter.";
  const email = text(lead.contact_email);
  if (!email || !isValidEmail(email))
    return "Informe um e-mail válido do contato antes de converter.";
  return validateOpportunityFields(opportunity);
}

/**
 * Converte o corpo validado para o registro gravado nas duas implementações.
 * Normaliza CNPJ para dígitos, aplica trim, troca vazio por nulo e fixa o
 * status inicial.
 */
export function toLeadRecord(
  id: string,
  body: Record<string, unknown>,
): Record<LeadWriteColumn | "id", unknown> {
  return { ...toLeadFields(body), id, status: "Novo" };
}

/**
 * Campos graváveis em edição, sem o status — que é validado à parte por
 * `validateLeadUpdate` e gravado junto na mesma instrução.
 */
export function toLeadUpdateRecord(
  body: Record<string, unknown>,
): Record<LeadWriteColumn | "disqualification_reason", unknown> {
  return {
    ...toLeadFields(body),
    status: body.status,
    disqualification_reason: text(body.disqualification_reason),
  };
}

function toLeadFields(
  body: Record<string, unknown>,
): Record<LeadWriteColumn, unknown> {
  const record = {} as Record<LeadWriteColumn, unknown>;
  for (const column of LEAD_WRITE_COLUMNS) {
    record[column] = text(body[column]);
  }
  record.company_name = text(body.company_name);
  record.trade_name = text(body.trade_name);
  record.tax_id = normalizeCnpj(text(body.tax_id));
  record.industry_id = text(body.industry_id);
  record.segment_id = text(body.segment_id);
  record.revenue_band = body.revenue_band;
  record.employee_band = body.employee_band;
  record.city_id = text(body.city_id);
  record.state = body.state;
  record.country_id = text(body.country_id);
  record.lead_source_id = text(body.lead_source_id);
  record.contact_same_address =
    body.contact_same_address === undefined ||
    body.contact_same_address === null ||
    body.contact_same_address === true ||
    body.contact_same_address === 1
      ? 1
      : 0;
  return record;
}
