/**
 * Especificação OpenAPI mantida manualmente para as rotas de `src/app/api`.
 *
 * Ao criar ou alterar uma rota, atualize este documento junto com os testes da
 * rota. A especificação é servida em `/api/openapi` apenas em desenvolvimento.
 */
import { COMPANY_PROFILE_FIELDS } from "./company-profile";
import { eventTypes } from "./event-validation";

const statuses = [
  "Em andamento",
  "Desenvolvimento",
  "Proposta",
  "Aceite da proposta",
  "Ganha",
  "Perdida",
];

const lossReasons = ["Preço", "Prazo", "Tecnologia", "Solução"];
const currencies = ["BRL", "USD", "EUR", "PES"];
const taskContactTypes = ["email", "telefone", "compromisso"];
const taskStatuses = ["Aberto", "Concluído"];

type JsonSchema = Record<string, unknown>;


function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schema: JsonSchema): Record<string, unknown> {
  return { "application/json": { schema } };
}

function success(description: string, schema: JsonSchema): Record<string, unknown> {
  return { description, content: jsonContent(schema) };
}

function errorResponse(description: string): Record<string, unknown> {
  return {
    description,
    content: jsonContent(ref("ErrorResponse")),
  };
}

function noContent(description: string): Record<string, unknown> {
  return { description };
}

function nullableString(description?: string): JsonSchema {
  return {
    type: ["string", "null"],
    ...(description ? { description } : {}),
  };
}

/**
 * Valores monetários e horas são persistidos como texto decimal canônico, mas
 * as rotas aceitam string ou número (`Number(body[key])`); `null` limpa o campo.
 */
function decimalInput(description: string): JsonSchema {
  return {
    description,
    anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
  };
}

const idParameter: JsonSchema = {
  name: "id",
  in: "path",
  required: true,
  description: "Identificador UUID do registro.",
  schema: { type: "string", format: "uuid" },
};

const logoNameParameter: JsonSchema = {
  name: "name",
  in: "path",
  required: true,
  description:
    "Nome do arquivo de logo no padrão `<uuid>.<extensão>`, com extensão png, jpg ou webp.",
  schema: {
    type: "string",
    pattern: "^[\\w-]+\\.(png|jpg|webp)$",
  },
};

const qParameter: JsonSchema = {
  name: "q",
  in: "query",
  required: false,
  description: "Busca textual livre, sem diferenciar maiúsculas de minúsculas.",
  schema: { type: "string" },
};

const compactParameter: JsonSchema = {
  name: "compact",
  in: "query",
  required: false,
  description:
    "Quando `1` ou `true`, retorna apenas as opções de cliente (`id`, `company_name`, `trade_name`, `is_active`).",
  schema: { type: "string", enum: ["1", "true"] },
};

const includeInactiveParameter: JsonSchema = {
  name: "include_inactive",
  in: "query",
  required: false,
  description:
    "Quando `1` ou `true`, inclui registros inativos. Em `/api/clients` só tem efeito junto com `compact`.",
  schema: { type: "string", enum: ["1", "true"] },
};

const clientIdQueryParameter: JsonSchema = {
  name: "client_id",
  in: "query",
  required: false,
  description: "Filtra pelo identificador UUID do cliente.",
  schema: { type: "string", format: "uuid" },
};

const opportunityStatusQueryParameter: JsonSchema = {
  name: "status",
  in: "query",
  required: false,
  description: "Filtra oportunidades pelo status.",
  schema: { type: "string", enum: statuses },
};

const taskStatusQueryParameter: JsonSchema = {
  name: "status",
  in: "query",
  required: false,
  description: "Filtra tarefas pelo status.",
  schema: { type: "string", enum: taskStatuses },
};

const eventTypeQueryParameter: JsonSchema = {
  name: "type",
  in: "query",
  required: false,
  description: "Filtra o histórico pelo tipo de evento.",
  schema: { type: "string", enum: eventTypes },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "CRMini API",
    version: "0.8.0",
    description:
      "API do CRMini para clientes, contatos, oportunidades, tarefas, histórico de eventos, configurações e consultas externas.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Clientes", description: "Empresas clientes e seus contatos." },
    { name: "Contatos", description: "Contatos vinculados a clientes." },
    {
      name: "Oportunidades",
      description: "Oportunidades comerciais e seus status.",
    },
    { name: "Tarefas", description: "Tarefas de acompanhamento." },
    { name: "Eventos", description: "Histórico de eventos do relacionamento." },
    { name: "Configurações", description: "Preferências do aplicativo." },
    {
      name: "Consultas externas",
      description: "Integrações com ViaCEP e sites públicos.",
    },
    { name: "Logos", description: "Upload e leitura de logos de clientes." },
  ],
  paths: {
    "/api/clients": {
      get: {
        operationId: "listClients",
        tags: ["Clientes"],
        summary: "Lista clientes",
        description:
          "Com `compact=1` ou `compact=true`, retorna as opções de cliente; caso contrário, retorna os clientes com seus contatos ativos.",
        parameters: [qParameter, compactParameter, includeInactiveParameter],
        responses: {
          "200": {
            description:
              "Lista de clientes ou, quando `compact` é informado, lista de opções de cliente.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { type: "array", items: ref("Client") },
                    { type: "array", items: ref("ClientOption") },
                  ],
                },
              },
            },
          },
          "503": errorResponse(
            "Não foi possível carregar os clientes por falha no banco de dados.",
          ),
        },
      },
      post: {
        operationId: "createClient",
        tags: ["Clientes"],
        summary: "Cadastra um cliente",
        description:
          "O nome da empresa é obrigatório. Contatos sem nome são ignorados.",
        requestBody: {
          required: true,
          content: jsonContent(ref("ClientInput")),
        },
        responses: {
          "201": success("Cliente criado.", ref("Client")),
          "400": errorResponse(
            "Corpo JSON inválido ou ausente, ou nome da empresa não informado.",
          ),
          "500": errorResponse("Não foi possível cadastrar o cliente."),
        },
      },
    },
    "/api/clients/{id}": {
      parameters: [idParameter],
      get: {
        operationId: "getClient",
        tags: ["Clientes"],
        summary: "Consulta um cliente",
        responses: {
          "200": success("Cliente encontrado, com contatos ativos.", ref("Client")),
          "404": errorResponse("Cliente não encontrado."),
          "503": errorResponse("Erro ao consultar cliente."),
        },
      },
      put: {
        operationId: "updateClient",
        tags: ["Clientes"],
        summary: "Atualiza um cliente",
        description:
          "Substitui os dados do cliente. Contatos enviados sem `id` são criados; contatos ativos omitidos são desativados.",
        requestBody: {
          required: true,
          content: jsonContent(ref("ClientInput")),
        },
        responses: {
          "200": success("Cliente atualizado.", ref("Client")),
          "400": errorResponse(
            "Corpo JSON inválido ou ausente, ou nome da empresa não informado.",
          ),
          "404": errorResponse("Cliente não encontrado."),
          "500": errorResponse("Não foi possível atualizar o cliente."),
        },
      },
      delete: {
        operationId: "deactivateClient",
        tags: ["Clientes"],
        summary: "Desativa um cliente",
        responses: {
          "204": noContent("Cliente desativado."),
          "404": errorResponse("Cliente não encontrado."),
          "500": errorResponse("Não foi possível desativar o cliente."),
        },
      },
    },
    "/api/contacts": {
      get: {
        operationId: "listContacts",
        tags: ["Contatos"],
        summary: "Lista contatos",
        parameters: [qParameter, includeInactiveParameter, {
          name: "segment",
          in: "query",
          required: false,
          description: "Filtra pelo segmento/indústria do cliente.",
          schema: { type: "string" },
        }],
        responses: {
          "200": success("Lista de contatos.", {
            type: "array",
            items: ref("Contact"),
          }),
          "503": errorResponse("Não foi possível carregar os contatos."),
        },
      },
      post: {
        operationId: "createContact",
        tags: ["Contatos"],
        summary: "Cadastra um contato",
        requestBody: {
          required: true,
          content: jsonContent(ref("ContactCreate")),
        },
        responses: {
          "201": success("Contato criado.", ref("Contact")),
          "400": errorResponse(
            "Corpo JSON inválido, nome do contato ausente ou cliente não informado.",
          ),
          "404": errorResponse("Cliente não encontrado ou inativo."),
          "500": errorResponse("Não foi possível cadastrar o contato."),
        },
      },
    },
    "/api/contacts/{id}": {
      parameters: [idParameter],
      get: {
        operationId: "getContact",
        tags: ["Contatos"],
        summary: "Consulta um contato",
        responses: {
          "200": success("Contato encontrado.", ref("Contact")),
          "404": errorResponse("Contato não encontrado."),
          "503": errorResponse("Não foi possível carregar o contato."),
        },
      },
      put: {
        operationId: "updateContact",
        tags: ["Contatos"],
        summary: "Atualiza um contato",
        requestBody: {
          required: true,
          content: jsonContent(ref("ContactUpdate")),
        },
        responses: {
          "200": success("Contato atualizado.", ref("Contact")),
          "400": errorResponse(
            "Corpo JSON inválido ou nome do contato não informado.",
          ),
          "404": errorResponse("Contato não encontrado."),
          "500": errorResponse("Não foi possível atualizar o contato."),
        },
      },
      patch: {
        operationId: "setContactStatus",
        tags: ["Contatos"],
        summary: "Ativa ou desativa um contato",
        requestBody: {
          required: true,
          content: jsonContent(ref("ContactStatusUpdate")),
        },
        responses: {
          "200": success("Contato com o novo status.", ref("Contact")),
          "400": errorResponse(
            "Corpo JSON inválido ou campo `is_active` ausente/não booleano.",
          ),
          "404": errorResponse("Contato não encontrado."),
          "500": errorResponse(
            "Não foi possível atualizar o status do contato.",
          ),
        },
      },
      delete: {
        operationId: "deactivateContact",
        tags: ["Contatos"],
        summary: "Desativa um contato",
        responses: {
          "204": noContent("Contato desativado."),
          "404": errorResponse("Contato não encontrado."),
          "500": errorResponse("Não foi possível desativar o contato."),
        },
      },
    },
    "/api/contacts/import": {
      post: {
        operationId: "importContacts",
        tags: ["Contatos"],
        summary: "Importa contatos em lote",
        description:
          "Aceita de 1 a 1000 itens. Com `dryRun: true`, apenas planeja a importação e devolve o que seria feito.",
        requestBody: {
          required: true,
          content: jsonContent(ref("ContactImportRequest")),
        },
        responses: {
          "200": success(
            "Resultado da importação ou do planejamento.",
            ref("ContactImportResponse"),
          ),
          "400": errorResponse(
            "Corpo JSON inválido ou item fora das regras de validação (lote, `rowId`, cliente, nome, cargo, e-mail ou LinkedIn).",
          ),
          "500": errorResponse("Não foi possível importar os contatos."),
        },
      },
    },
    "/api/opportunities": {
      get: {
        operationId: "listOpportunities",
        tags: ["Oportunidades"],
        summary: "Lista oportunidades",
        parameters: [qParameter, clientIdQueryParameter, opportunityStatusQueryParameter],
        responses: {
          "200": success("Lista de oportunidades.", {
            type: "array",
            items: ref("Opportunity"),
          }),
          "503": errorResponse(
            "Não foi possível carregar as oportunidades.",
          ),
        },
      },
      post: {
        operationId: "createOpportunity",
        tags: ["Oportunidades"],
        summary: "Cadastra uma oportunidade",
        description:
          "Cliente e contato são obrigatórios e precisam pertencer ao mesmo cliente. O status padrão é `Em andamento`; moeda padrão `BRL`; abertura padrão é a data atual.",
        requestBody: {
          required: true,
          content: jsonContent(ref("OpportunityCreate")),
        },
        responses: {
          "201": success("Oportunidade criada.", ref("Opportunity")),
          "400": errorResponse(
            "Corpo inválido, campos obrigatórios ausentes, status/motivo/moeda inválidos, valor negativo ou cliente/contato não encontrados.",
          ),
        },
      },
    },
    "/api/opportunities/{id}": {
      parameters: [idParameter],
      get: {
        operationId: "getOpportunity",
        tags: ["Oportunidades"],
        summary: "Consulta uma oportunidade",
        responses: {
          "200": success("Oportunidade encontrada.", ref("Opportunity")),
          "404": errorResponse("Oportunidade não encontrada."),
          "503": errorResponse("Erro ao consultar oportunidade."),
        },
      },
      patch: {
        operationId: "updateOpportunityStatus",
        tags: ["Oportunidades"],
        summary: "Altera o status de uma oportunidade",
        description:
          "O motivo de perda é obrigatório quando o status é `Perdida` e proibido nos demais status.",
        requestBody: {
          required: true,
          content: jsonContent(ref("OpportunityStatusUpdate")),
        },
        responses: {
          "200": success("Status alterado.", {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean", const: true } },
          }),
          "400": errorResponse("Status ou motivo de perda inválido."),
          "404": errorResponse("Oportunidade não encontrada."),
        },
      },
      put: {
        operationId: "updateOpportunity",
        tags: ["Oportunidades"],
        summary: "Atualiza uma oportunidade",
        description:
          "Substitui os dados enviados. Status, motivo de perda, moeda e valores precisam respeitar as mesmas regras da criação.",
        requestBody: {
          required: true,
          content: jsonContent(ref("OpportunityUpdate")),
        },
        responses: {
          "200": success("Oportunidade atualizada.", ref("Opportunity")),
          "400": errorResponse(
            "Corpo inválido, campos obrigatórios ausentes, status/motivo/moeda inválidos ou valor negativo.",
          ),
          "404": errorResponse(
            "Oportunidade ou associação válida de cliente/contato não encontrada.",
          ),
        },
      },
    },
    "/api/tasks": {
      get: {
        operationId: "listTasks",
        tags: ["Tarefas"],
        summary: "Lista tarefas",
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            description:
              "Data civil (`YYYY-MM-DD`) no fuso `America/Sao_Paulo`; filtra as tarefas daquele dia.",
            schema: { type: "string", format: "date" },
          },
          taskStatusQueryParameter,
        ],
        responses: {
          "200": success("Lista de tarefas.", {
            type: "array",
            items: ref("Task"),
          }),
          "400": errorResponse(
            "Status inválido, data inválida ou falha ao carregar as tarefas.",
          ),
        },
      },
      post: {
        operationId: "createTask",
        tags: ["Tarefas"],
        summary: "Cadastra uma tarefa",
        requestBody: {
          required: true,
          content: jsonContent(ref("TaskCreate")),
        },
        responses: {
          "201": success("Tarefa criada.", ref("Task")),
          "400": errorResponse(
            "Corpo inválido, tipo/assunto/data inválidos, descrição muito longa ou cliente/contato não encontrados.",
          ),
        },
      },
    },
    "/api/tasks/{id}": {
      parameters: [idParameter],
      patch: {
        operationId: "updateTaskStatus",
        tags: ["Tarefas"],
        summary: "Altera o status de uma tarefa",
        requestBody: {
          required: true,
          content: jsonContent(ref("TaskStatusUpdate")),
        },
        responses: {
          "200": success("Status da tarefa alterado.", {
            type: "object",
            required: ["id", "status"],
            properties: {
              id: { type: "string", format: "uuid" },
              status: { type: "string", enum: taskStatuses },
            },
          }),
          "400": errorResponse("Status inválido."),
          "404": errorResponse("Tarefa não encontrada."),
        },
      },
    },
    "/api/events": {
      get: {
        operationId: "listEvents",
        tags: ["Eventos"],
        summary: "Lista o histórico de eventos",
        description:
          "É obrigatório informar `client_id` ou `opportunity_id`. O limite padrão é 50.",
        parameters: [
          clientIdQueryParameter,
          {
            name: "opportunity_id",
            in: "query",
            required: false,
            description: "Filtra pelo identificador UUID da oportunidade.",
            schema: { type: "string", format: "uuid" },
          },
          eventTypeQueryParameter,
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Quantidade máxima de eventos (1 a 100).",
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": success("Lista de eventos ativos.", {
            type: "array",
            items: ref("Event"),
          }),
          "400": errorResponse(
            "Cliente/oportunidade não informados, tipo de evento inválido ou limite inválido.",
          ),
          "503": errorResponse("Não foi possível carregar o histórico."),
        },
      },
      post: {
        operationId: "createEvent",
        tags: ["Eventos"],
        summary: "Cadastra um evento",
        description:
          "`event_type` padrão é `nota` e `occurred_at` padrão é a data atual no fuso `America/Sao_Paulo`. A data não pode ser futura.",
        requestBody: {
          required: true,
          content: jsonContent(ref("EventCreate")),
        },
        responses: {
          "201": success("Evento criado.", ref("Event")),
          "400": errorResponse(
            "Corpo inválido, campos de validação do evento inválidos ou cliente/oportunidade/contato não encontrados.",
          ),
        },
      },
    },
    "/api/events/{id}": {
      parameters: [idParameter],
      patch: {
        operationId: "updateEvent",
        tags: ["Eventos"],
        summary: "Atualiza um evento",
        description:
          "O cliente e a origem do evento não podem ser alterados. Eventos de origem também não podem trocar de oportunidade.",
        requestBody: {
          required: true,
          content: jsonContent(ref("EventUpdate")),
        },
        responses: {
          "200": success("Evento atualizado.", ref("Event")),
          "400": errorResponse(
            "Corpo inválido, alteração de cliente/origem não permitida, validação do evento falhou ou associação inválida.",
          ),
          "404": errorResponse("Evento não encontrado ou inativo."),
        },
      },
      delete: {
        operationId: "deleteEvent",
        tags: ["Eventos"],
        summary: "Exclui um evento",
        responses: {
          "204": noContent("Evento desativado (ou já estava inativo)."),
          "404": errorResponse("Evento não encontrado."),
          "409": errorResponse("Eventos de origem não podem ser excluídos."),
          "400": errorResponse("Não foi possível excluir o evento."),
        },
      },
    },
    "/api/settings": {
      get: {
        operationId: "getSettings",
        tags: ["Configurações"],
        summary: "Consulta as configurações",
        responses: {
          "200": success("Configurações atuais.", ref("Settings")),
          "500": errorResponse("Não foi possível carregar as configurações."),
        },
      },
      put: {
        operationId: "updateSettings",
        tags: ["Configurações"],
        summary: "Salva as configurações",
        requestBody: {
          required: true,
          content: jsonContent(ref("SettingsUpdate")),
        },
        responses: {
          "200": success("Configurações salvas.", ref("Settings")),
          "400": errorResponse(
            "Corpo inválido, nome do usuário ausente ou acima de 80 caracteres.",
          ),
          "500": errorResponse("Não foi possível salvar as configurações."),
        },
      },
    },
    "/api/cep": {
      get: {
        operationId: "lookupCep",
        tags: ["Consultas externas"],
        summary: "Consulta um CEP",
        description:
          "Consulta o ViaCEP e devolve o endereço normalizado. Depende de acesso à internet.",
        parameters: [
          {
            name: "cep",
            in: "query",
            required: true,
            description: "CEP com 8 dígitos, com ou sem máscara.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": success("Endereço encontrado.", ref("CepAddress")),
          "400": errorResponse("CEP não informado ou fora do formato de 8 dígitos."),
          "404": errorResponse("CEP não encontrado no ViaCEP."),
          "502": errorResponse(
            "Não foi possível consultar o CEP no ViaCEP.",
          ),
        },
      },
    },
    "/api/company/from-site": {
      post: {
        operationId: "lookupCompanyFromSite",
        tags: ["Consultas externas"],
        summary: "Extrai dados cadastrais de um site",
        description:
          "Busca a home do site informado e extrai dados públicos de empresa. Endereços privados ou bloqueados são recusados.",
        requestBody: {
          required: true,
          content: jsonContent(ref("SiteLookupRequest")),
        },
        responses: {
          "200": success("Dados cadastrais encontrados.", ref("CompanyProfile")),
          "400": errorResponse(
            "Site não informado, inválido ou endereço bloqueado.",
          ),
          "404": errorResponse("Nenhum dado cadastral encontrado no site."),
          "502": errorResponse(
            "Não foi possível acessar o site informado.",
          ),
        },
      },
    },
    "/api/logo": {
      post: {
        operationId: "uploadLogo",
        tags: ["Logos"],
        summary: "Envia um logo",
        description:
          "Aceita PNG, JPG ou WebP com até 2 MB. O arquivo é salvo e o caminho público é devolvido.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "Imagem PNG, JPG ou WebP com até 2 MB.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": success("Logo salvo.", ref("LogoUploadResponse")),
          "400": errorResponse(
            "Arquivo não enviado, formato não permitido ou imagem acima de 2 MB.",
          ),
          "500": errorResponse(
            "Não foi possível salvar a imagem na pasta de assets.",
          ),
        },
      },
    },
    "/api/logo/{name}": {
      parameters: [logoNameParameter],
      get: {
        operationId: "getLogo",
        tags: ["Logos"],
        summary: "Lê um logo salvo",
        responses: {
          "200": {
            description: "Conteúdo binário da imagem.",
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } },
            },
          },
          "404": {
            description:
              "Nome fora do padrão permitido ou arquivo não encontrado (corpo vazio).",
          },
        },
      },
    },
    "/api/logo/from-site": {
      post: {
        operationId: "importLogoFromSite",
        tags: ["Logos"],
        summary: "Busca o logo de um site",
        description:
          "Tenta baixar ícones do site informado e salva o primeiro compatível. Endereços privados ou bloqueados são recusados.",
        requestBody: {
          required: true,
          content: jsonContent(ref("SiteLookupRequest")),
        },
        responses: {
          "200": success("Logo encontrado e salvo.", ref("LogoUploadResponse")),
          "400": errorResponse(
            "Site não informado, inválido ou endereço bloqueado.",
          ),
          "404": errorResponse("Nenhum logo encontrado no site."),
          "413": errorResponse("O logo encontrado excede 2 MB."),
          "415": errorResponse(
            "O logo encontrado não está em PNG, JPG ou WebP.",
          ),
          "500": errorResponse(
            "Não foi possível salvar a imagem na pasta de assets.",
          ),
          "502": errorResponse("Não foi possível acessar o site informado."),
        },
      },
    },
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: "object",
        description: "Erro padronizado das rotas da API.",
        required: ["error"],
        properties: {
          error: {
            type: "string",
            description: "Mensagem de erro em português, pronta para exibição.",
          },
        },
      },
      ClientOption: {
        type: "object",
        description: "Opção resumida de cliente usada em seletores.",
        required: ["id", "company_name", "is_active"],
        properties: {
          id: { type: "string", format: "uuid" },
          company_name: { type: "string" },
          trade_name: nullableString("Nome fantasia."),
          is_active: { type: "boolean" },
        },
      },
      ClientContact: {
        type: "object",
        description: "Contato embutido na resposta de um cliente.",
        required: ["id", "full_name", "is_primary", "is_active"],
        properties: {
          id: { type: "string", format: "uuid" },
          client_id: { type: "string", format: "uuid" },
          full_name: { type: "string" },
          job_title: nullableString("Cargo."),
          email: nullableString("E-mail do contato."),
          phone: nullableString("Telefone fixo."),
          mobile: nullableString("Celular."),
          birthday: {
            type: ["string", "null"],
            format: "date",
            description:
              "Data civil de aniversário (`YYYY-MM-DD`), sem hora nem fuso.",
          },
          linkedin_url: nullableString("URL do perfil no LinkedIn."),
          notes: nullableString("Observações."),
          is_primary: {
            type: "boolean",
            description:
              "Indica contato principal. Não há exclusividade garantida pelo schema.",
          },
          is_active: { type: "boolean" },
          created_at: {
            type: "string",
            format: "date-time",
            description: "Instante de criação em ISO-8601 UTC.",
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description: "Instante da última atualização em ISO-8601 UTC.",
          },
        },
      },
      Client: {
        type: "object",
        description: "Empresa cliente do CRM.",
        required: ["id", "company_name", "is_active", "created_at", "updated_at"],
        properties: {
          id: { type: "string", format: "uuid" },
          company_name: { type: "string" },
          trade_name: nullableString("Nome fantasia."),
          tax_id: nullableString("CNPJ ou documento fiscal."),
          industry: nullableString("Segmento/indústria."),
          website: nullableString("Site da empresa."),
          phone: nullableString("Telefone."),
          email: nullableString("E-mail."),
          postal_code: nullableString("CEP."),
          street: nullableString("Logradouro."),
          street_number: nullableString("Número."),
          complement: nullableString("Complemento."),
          city: nullableString("Cidade."),
          state: nullableString("UF ou estado."),
          country: {
            type: ["string", "null"],
            description: "País.",
          },
          notes: nullableString("Observações."),
          logo_path: nullableString(
            "Caminho público do logo, como `/api/logo/<arquivo>`.",
          ),
          is_active: { type: "boolean" },
          created_at: {
            type: "string",
            format: "date-time",
            description: "Instante de criação em ISO-8601 UTC.",
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description: "Instante da última atualização em ISO-8601 UTC.",
          },
          contacts: {
            type: "array",
            description:
              "Contatos ativos; presente nas respostas de listagem e consulta de cliente.",
            items: ref("ClientContact"),
          },
        },
      },
      ClientContactInput: {
        type: "object",
        description:
          "Contato enviado junto do cliente. Sem `id`, é criado; com `id` existente, é atualizado.",
        properties: {
          id: { type: "string", format: "uuid" },
          full_name: { type: "string" },
          job_title: nullableString("Cargo."),
          email: nullableString("E-mail."),
          phone: nullableString("Telefone."),
          mobile: nullableString("Celular."),
          birthday: {
            type: ["string", "null"],
            format: "date",
            description: "Data civil de aniversário (`YYYY-MM-DD`).",
          },
          linkedin_url: nullableString("URL do perfil no LinkedIn."),
          notes: nullableString("Observações."),
          is_primary: { type: "boolean" },
        },
      },
      ClientInput: {
        type: "object",
        description:
          "Dados de criação/atualização de cliente. Em atualizações, os contatos ativos omitidos são desativados.",
        required: ["company_name"],
        properties: {
          company_name: { type: "string", description: "Nome da empresa." },
          trade_name: nullableString("Nome fantasia."),
          tax_id: nullableString("CNPJ ou documento fiscal."),
          industry: nullableString("Segmento/indústria."),
          website: nullableString("Site da empresa."),
          phone: nullableString("Telefone."),
          email: nullableString("E-mail."),
          postal_code: nullableString("CEP."),
          street: nullableString("Logradouro."),
          street_number: nullableString("Número."),
          complement: nullableString("Complemento."),
          city: nullableString("Cidade."),
          state: nullableString("UF ou estado."),
          country: nullableString("País; padrão `Brasil` quando omitido."),
          notes: nullableString("Observações."),
          logo_path: nullableString("Caminho público do logo."),
          contacts: {
            type: "array",
            items: ref("ClientContactInput"),
          },
        },
      },
      Contact: {
        type: "object",
        description: "Contato vinculado a um cliente.",
        required: ["id", "client_id", "full_name", "is_primary", "is_active"],
        properties: {
          id: { type: "string", format: "uuid" },
          client_id: { type: "string", format: "uuid" },
          full_name: { type: "string" },
          job_title: nullableString("Cargo."),
          email: nullableString("E-mail."),
          phone: nullableString("Telefone fixo."),
          mobile: nullableString("Celular."),
          birthday: {
            type: ["string", "null"],
            format: "date",
            description:
              "Data civil de aniversário (`YYYY-MM-DD`), sem hora nem fuso.",
          },
          linkedin_url: nullableString("URL do perfil no LinkedIn."),
          notes: nullableString("Observações."),
          is_primary: {
            type: "boolean",
            description:
              "Indica contato principal. Não há exclusividade garantida pelo schema.",
          },
          is_active: { type: "boolean" },
          company_name: nullableString(
            "Nome do cliente; presente nas respostas de consulta/listagem.",
          ),
          trade_name: nullableString("Nome fantasia do cliente."),
          industry: nullableString("Segmento/indústria do cliente."),
          logo_path: nullableString(
            "Caminho público do logo do cliente; presente na listagem.",
          ),
          created_at: {
            type: "string",
            format: "date-time",
            description: "Instante de criação em ISO-8601 UTC.",
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description: "Instante da última atualização em ISO-8601 UTC.",
          },
        },
      },
      ContactCreate: {
        type: "object",
        required: ["full_name", "client_id"],
        properties: {
          full_name: { type: "string", description: "Nome do contato." },
          client_id: { type: "string", format: "uuid" },
          job_title: nullableString("Cargo."),
          email: nullableString("E-mail."),
          phone: nullableString("Telefone fixo."),
          mobile: nullableString("Celular."),
          birthday: {
            type: ["string", "null"],
            format: "date",
            description: "Data civil de aniversário (`YYYY-MM-DD`).",
          },
          linkedin_url: nullableString("URL do perfil no LinkedIn."),
          notes: nullableString("Observações."),
          is_primary: { type: "boolean" },
        },
      },
      ContactUpdate: {
        type: "object",
        description:
          "Dados de atualização do contato. O vínculo com o cliente não é alterado.",
        required: ["full_name"],
        properties: {
          full_name: { type: "string", description: "Nome do contato." },
          job_title: nullableString("Cargo."),
          email: nullableString("E-mail."),
          phone: nullableString("Telefone fixo."),
          mobile: nullableString("Celular."),
          birthday: {
            type: ["string", "null"],
            format: "date",
            description: "Data civil de aniversário (`YYYY-MM-DD`).",
          },
          linkedin_url: nullableString("URL do perfil no LinkedIn."),
          notes: nullableString("Observações."),
          is_primary: { type: "boolean" },
        },
      },
      ContactStatusUpdate: {
        type: "object",
        required: ["is_active"],
        properties: {
          is_active: {
            type: "boolean",
            description: "`true` reativa o contato; `false` o desativa.",
          },
        },
      },
      ContactImportItem: {
        type: "object",
        required: ["rowId", "clientId", "fullName"],
        properties: {
          rowId: {
            type: "number",
            description: "Identificador da linha no arquivo de origem.",
          },
          clientId: { type: "string", description: "UUID do cliente." },
          fullName: {
            type: "string",
            description: "Nome do contato; até 200 caracteres após trim.",
          },
          jobTitle: nullableString("Cargo; até 200 caracteres."),
          email: nullableString("E-mail válido."),
          linkedinUrl: nullableString("URL de perfil válido do LinkedIn."),
        },
      },
      ContactImportRequest: {
        type: "object",
        required: ["items"],
        properties: {
          dryRun: {
            type: "boolean",
            description:
              "Quando `true`, apenas planeja a importação sem gravar contatos.",
          },
          items: {
            type: "array",
            minItems: 1,
            maxItems: 1000,
            items: ref("ContactImportItem"),
          },
        },
      },
      ContactImportOutcome: {
        type: "object",
        required: ["rowId", "status"],
        properties: {
          rowId: { type: "number" },
          status: {
            type: "string",
            enum: [
              "imported",
              "would_import",
              "duplicate",
              "duplicate_in_batch",
              "invalid_client",
              "invalid_name",
            ],
          },
          contactId: {
            type: "string",
            format: "uuid",
            description: "Presente quando o contato foi importado.",
          },
          existingContactId: {
            type: "string",
            format: "uuid",
            description: "Presente quando o item é duplicado.",
          },
        },
      },
      ContactImportResponse: {
        type: "object",
        required: ["dryRun", "counts", "items"],
        properties: {
          dryRun: { type: "boolean" },
          counts: {
            type: "object",
            required: ["received", "imported", "wouldImport", "skipped"],
            properties: {
              received: { type: "integer" },
              imported: { type: "integer" },
              wouldImport: { type: "integer" },
              skipped: { type: "integer" },
            },
          },
          items: {
            type: "array",
            items: ref("ContactImportOutcome"),
          },
        },
      },
      Opportunity: {
        type: "object",
        description: "Oportunidade comercial vinculada a um cliente e contato.",
        required: [
          "id",
          "name",
          "client_id",
          "contact_id",
          "currency",
          "status",
          "opened_at",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          client_id: { type: "string", format: "uuid" },
          contact_id: {
            type: "string",
            format: "uuid",
            description: "Contato do mesmo cliente da oportunidade.",
          },
          technology: nullableString("Tecnologia."),
          value: nullableString(
            "Valor em decimal canônico (ex.: `\"1234.56\"`), não negativo.",
          ),
          currency: {
            type: "string",
            enum: currencies,
            description: "Moeda do valor.",
          },
          service_type: nullableString("Tipo de serviço."),
          resources: nullableString("Recursos."),
          budget: nullableString(
            "Budget em decimal canônico (ex.: `\"1234.56\"`), não negativo.",
          ),
          budget_currency: {
            anyOf: [{ type: "string", enum: currencies }, { type: "null" }],
            description: "Moeda do budget.",
          },
          notes: nullableString("Observações."),
          customer_need: nullableString("Necessidade do cliente."),
          offered_solution: nullableString("Solução oferecida."),
          project_hours: nullableString(
            "Horas de projeto em decimal canônico, não negativo.",
          ),
          opened_at: {
            type: "string",
            format: "date",
            description:
              "Data civil de abertura (`YYYY-MM-DD`), sem hora nem fuso.",
          },
          expected_close_at: {
            type: ["string", "null"],
            format: "date",
            description:
              "Data civil prevista de fechamento (`YYYY-MM-DD`).",
          },
          status: { type: "string", enum: statuses },
          loss_reason: {
            anyOf: [{ type: "string", enum: lossReasons }, { type: "null" }],
            description:
              "Obrigatório somente quando o status é `Perdida`; nulo nos demais.",
          },
          created_at: {
            type: "string",
            format: "date-time",
            description: "Instante de criação em ISO-8601 UTC.",
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description: "Instante da última atualização em ISO-8601 UTC.",
          },
          company_name: nullableString(
            "Nome do cliente; presente nas respostas de consulta/listagem.",
          ),
          contact_name: nullableString("Nome do contato."),
          contact_email: nullableString("E-mail do contato."),
          contact_phone: nullableString("Telefone do contato."),
        },
      },
      OpportunityCreate: {
        type: "object",
        required: ["name", "client_id", "contact_id"],
        properties: {
          name: { type: "string" },
          client_id: { type: "string", format: "uuid" },
          contact_id: { type: "string", format: "uuid" },
          technology: nullableString("Tecnologia."),
          value: decimalInput(
            "Valor não negativo; aceita string decimal ou número.",
          ),
          currency: {
            type: "string",
            enum: currencies,
            default: "BRL",
          },
          service_type: nullableString("Tipo de serviço."),
          resources: nullableString("Recursos."),
          budget: decimalInput(
            "Budget não negativo; aceita string decimal ou número.",
          ),
          budget_currency: {
            anyOf: [{ type: "string", enum: currencies }, { type: "null" }],
          },
          notes: nullableString("Observações."),
          customer_need: nullableString("Necessidade do cliente."),
          offered_solution: nullableString("Solução oferecida."),
          project_hours: decimalInput(
            "Horas de projeto não negativas; aceita string decimal ou número.",
          ),
          opened_at: {
            type: "string",
            format: "date",
            description:
              "Data civil de abertura (`YYYY-MM-DD`); padrão é a data atual.",
          },
          expected_close_at: {
            type: ["string", "null"],
            format: "date",
          },
          status: {
            type: "string",
            enum: statuses,
            default: "Em andamento",
          },
          loss_reason: {
            anyOf: [{ type: "string", enum: lossReasons }, { type: "null" }],
            description: "Obrigatório apenas quando `status` é `Perdida`.",
          },
        },
      },
      OpportunityUpdate: {
        type: "object",
        description:
          "Atualização completa da oportunidade. Status e moeda são obrigatórios nesta rota.",
        required: [
          "name",
          "client_id",
          "contact_id",
          "status",
          "currency",
        ],
        properties: {
          name: { type: "string" },
          client_id: { type: "string", format: "uuid" },
          contact_id: { type: "string", format: "uuid" },
          technology: nullableString("Tecnologia."),
          value: decimalInput(
            "Valor não negativo; aceita string decimal ou número.",
          ),
          currency: { type: "string", enum: currencies },
          service_type: nullableString("Tipo de serviço."),
          resources: nullableString("Recursos."),
          budget: decimalInput(
            "Budget não negativo; aceita string decimal ou número.",
          ),
          budget_currency: {
            anyOf: [{ type: "string", enum: currencies }, { type: "null" }],
          },
          notes: nullableString("Observações."),
          customer_need: nullableString("Necessidade do cliente."),
          offered_solution: nullableString("Solução oferecida."),
          project_hours: decimalInput(
            "Horas de projeto não negativas; aceita string decimal ou número.",
          ),
          opened_at: {
            type: "string",
            format: "date",
            description: "Data civil de abertura (`YYYY-MM-DD`).",
          },
          expected_close_at: {
            type: ["string", "null"],
            format: "date",
          },
          status: { type: "string", enum: statuses },
          loss_reason: {
            anyOf: [{ type: "string", enum: lossReasons }, { type: "null" }],
            description: "Obrigatório apenas quando `status` é `Perdida`.",
          },
        },
      },
      OpportunityStatusUpdate: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: statuses },
          loss_reason: {
            anyOf: [{ type: "string", enum: lossReasons }, { type: "null" }],
            description:
              "Obrigatório quando `status` é `Perdida` e proibido nos demais.",
          },
        },
      },
      Task: {
        type: "object",
        description: "Tarefa de acompanhamento vinculada a cliente e contato.",
        required: [
          "id",
          "contact_type",
          "subject",
          "scheduled_at",
          "status",
          "client_id",
          "contact_id",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          contact_type: { type: "string", enum: taskContactTypes },
          subject: { type: "string", description: "Assunto, até 200 caracteres." },
          description: nullableString("Descrição, até 5000 caracteres."),
          scheduled_at: {
            type: "string",
            format: "date-time",
            description:
              "Instante agendado em ISO-8601; persistido em UTC e exibido em `America/Sao_Paulo`.",
          },
          status: { type: "string", enum: taskStatuses },
          client_id: { type: "string", format: "uuid" },
          contact_id: {
            type: "string",
            format: "uuid",
            description: "Contato do mesmo cliente da tarefa.",
          },
          company_name: nullableString(
            "Nome do cliente; presente nas respostas de listagem.",
          ),
          contact_name: nullableString("Nome do contato; presente na listagem."),
          created_at: {
            type: "string",
            format: "date-time",
            description:
              "Instante de criação em ISO-8601 UTC; presente na criação.",
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description:
              "Instante da última atualização em ISO-8601 UTC; presente na criação.",
          },
        },
      },
      TaskCreate: {
        type: "object",
        required: [
          "contact_type",
          "subject",
          "scheduled_at",
          "client_id",
          "contact_id",
        ],
        properties: {
          contact_type: { type: "string", enum: taskContactTypes },
          subject: { type: "string", description: "Assunto, até 200 caracteres." },
          description: nullableString("Descrição, até 5000 caracteres."),
          scheduled_at: {
            type: "string",
            format: "date-time",
            description: "Instante agendado em ISO-8601.",
          },
          client_id: { type: "string", format: "uuid" },
          contact_id: { type: "string", format: "uuid" },
        },
      },
      TaskStatusUpdate: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: taskStatuses },
        },
      },
      Event: {
        type: "object",
        description: "Evento do histórico de relacionamento.",
        required: [
          "id",
          "client_id",
          "event_type",
          "title",
          "occurred_at",
          "is_origin",
          "is_active",
          "created_at",
          "updated_at",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          client_id: { type: "string", format: "uuid" },
          opportunity_id: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "Oportunidade do mesmo cliente; obrigatória para eventos de origem.",
          },
          contact_id: {
            type: ["string", "null"],
            format: "uuid",
            description: "Contato do mesmo cliente.",
          },
          event_type: { type: "string", enum: eventTypes },
          title: { type: "string", description: "Título, até 200 caracteres." },
          details: nullableString("Detalhes, até 5000 caracteres."),
          occurred_at: {
            type: "string",
            format: "date",
            description:
              "Data civil do evento (`YYYY-MM-DD`), sem hora nem fuso; não pode ser futura.",
          },
          is_origin: {
            type: "boolean",
            description:
              "Evento de origem da oportunidade; não pode ser excluído.",
          },
          is_active: { type: "boolean" },
          company_name: nullableString(
            "Nome do cliente; presente nas respostas de consulta/listagem.",
          ),
          opportunity_name: nullableString("Nome da oportunidade."),
          contact_name: nullableString("Nome do contato."),
          created_at: {
            type: "string",
            format: "date-time",
            description: "Instante de criação em ISO-8601 UTC.",
          },
          updated_at: {
            type: "string",
            format: "date-time",
            description: "Instante da última atualização em ISO-8601 UTC.",
          },
        },
      },
      EventCreate: {
        type: "object",
        required: ["client_id", "title"],
        properties: {
          client_id: { type: "string", format: "uuid" },
          opportunity_id: {
            type: ["string", "null"],
            format: "uuid",
          },
          contact_id: {
            type: ["string", "null"],
            format: "uuid",
          },
          event_type: {
            type: "string",
            enum: eventTypes,
            default: "nota",
          },
          title: { type: "string", description: "Título, até 200 caracteres." },
          details: nullableString("Detalhes, até 5000 caracteres."),
          occurred_at: {
            type: "string",
            format: "date",
            description:
              "Data civil (`YYYY-MM-DD`); padrão é a data atual em `America/Sao_Paulo`.",
          },
        },
      },
      EventUpdate: {
        type: "object",
        description:
          "Campos editáveis do evento. `client_id` e `is_origin` só podem ser enviados com o valor atual.",
        properties: {
          client_id: {
            type: "string",
            format: "uuid",
            description: "Não pode ser alterado.",
          },
          is_origin: {
            type: "boolean",
            description: "Não pode ser alterado.",
          },
          opportunity_id: {
            type: ["string", "null"],
            format: "uuid",
            description:
              "Não pode ser alterado em eventos de origem; nos demais, precisa pertencer ao cliente.",
          },
          contact_id: {
            type: ["string", "null"],
            format: "uuid",
            description: "Precisa pertencer ao cliente.",
          },
          event_type: { type: "string", enum: eventTypes },
          title: { type: "string", description: "Título, até 200 caracteres." },
          details: nullableString("Detalhes, até 5000 caracteres."),
          occurred_at: {
            type: "string",
            format: "date",
            description:
              "Data civil (`YYYY-MM-DD`), não futura.",
          },
        },
      },
      Settings: {
        type: "object",
        required: ["userName"],
        properties: {
          userName: nullableString(
            "Nome do usuário exibido na saudação; `null` quando não configurado.",
          ),
        },
      },
      SettingsUpdate: {
        type: "object",
        required: ["userName"],
        properties: {
          userName: {
            type: "string",
            maxLength: 80,
            description:
              "Nome do usuário; espaços repetidos são normalizados e o limite é 80 caracteres.",
          },
        },
      },
      CepAddress: {
        type: "object",
        description: "Endereço normalizado retornado pela consulta de CEP.",
        required: ["postal_code", "street", "city", "state"],
        properties: {
          postal_code: { type: "string", description: "CEP formatado." },
          street: { type: "string", description: "Logradouro." },
          city: { type: "string", description: "Cidade." },
          state: { type: "string", description: "UF." },
        },
      },
      SiteLookupRequest: {
        type: "object",
        required: ["website"],
        properties: {
          website: {
            type: "string",
            description: "Endereço http(s) público do site da empresa.",
          },
        },
      },
      CompanyProfileField: {
        type: "object",
        required: ["value", "source", "confidence"],
        properties: {
          value: { type: "string" },
          source: {
            type: "string",
            enum: ["json-ld", "opengraph", "microdata", "links", "text"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
      CompanyProfile: {
        type: "object",
        description: "Dados cadastrais extraídos do site informado.",
        required: ["source_url", "fields", "missing"],
        properties: {
          source_url: {
            type: "string",
            format: "uri",
            description: "URL final acessada após redirecionamentos.",
          },
          fields: {
            type: "object",
            description:
              "Campos encontrados, indexados pelo nome do campo do cliente.",
            propertyNames: { enum: COMPANY_PROFILE_FIELDS },
            additionalProperties: ref("CompanyProfileField"),
          },
          missing: {
            type: "array",
            description: "Campos conhecidos que não foram encontrados.",
            items: { type: "string", enum: COMPANY_PROFILE_FIELDS },
          },
        },
      },
      LogoUploadResponse: {
        type: "object",
        required: ["logo_path"],
        properties: {
          logo_path: {
            type: "string",
            description: "Caminho público para leitura do logo salvo.",
          },
          source_url: {
            type: "string",
            format: "uri",
            description:
              "URL de origem da imagem; presente apenas em `/api/logo/from-site`.",
          },
        },
      },
    },
  },
};
