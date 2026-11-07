import { describe, expect, it } from "vitest";
import { eventTypes } from "./event-validation";
import { openApiDocument } from "./openapi";

type JsonObject = Record<string, unknown>;

type Parameter = {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: JsonObject;
};

type Operation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  parameters?: Parameter[];
  responses?: Record<string, unknown>;
};

type PathItem = {
  parameters?: Parameter[];
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
};

type Schema = {
  required?: string[];
  properties?: Record<string, Schema & { enum?: unknown[]; anyOf?: Schema[] }>;
  type?: string | string[];
  nullable?: unknown;
  anyOf?: Schema[];
};

type Document = {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string }>;
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, PathItem>;
  components: { schemas: Record<string, Schema> };
};

const document = openApiDocument as unknown as Document;
const operations = ["get", "post", "put", "patch", "delete"] as const;

const expectedPaths = [
  "/api/clients",
  "/api/clients/{id}",
  "/api/contacts",
  "/api/contacts/{id}",
  "/api/contacts/import",
  "/api/opportunities",
  "/api/opportunities/{id}",
  "/api/tasks",
  "/api/tasks/{id}",
  "/api/events",
  "/api/events/{id}",
  "/api/settings",
  "/api/cep",
  "/api/company/from-site",
  "/api/logo",
  "/api/logo/{name}",
  "/api/logo/from-site",
];

function pathOperations(pathItem: PathItem): Array<[string, Operation]> {
  return operations.flatMap((method) => {
    const operation = pathItem[method];
    return operation ? [[method, operation] as [string, Operation]] : [];
  });
}

function collectRefs(value: unknown, refs: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const [key, child] of Object.entries(value as JsonObject)) {
    if (key === "$ref" && typeof child === "string") refs.push(child);
    else collectRefs(child, refs);
  }
}

function propertyEnum(schemaName: string, propertyName: string): unknown[] {
  const schema = document.components.schemas[schemaName];
  expect(schema, `schema ${schemaName} ausente`).toBeDefined();
  const property = schema.properties?.[propertyName];
  expect(
    property,
    `propriedade ${schemaName}.${propertyName} ausente`,
  ).toBeDefined();

  if (Array.isArray(property?.enum)) return property.enum;

  const enumBranch = property?.anyOf?.find((branch) =>
    Array.isArray(branch.enum),
  );
  expect(
    enumBranch?.enum,
    `propriedade ${schemaName}.${propertyName} sem enum`,
  ).toBeDefined();
  return enumBranch?.enum ?? [];
}

describe("Documento OpenAPI", () => {
  it("declara OpenAPI 3.1 e os metadados do CRMini", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toBe("CRMini API");
    expect(document.info.version).toBe("0.8.0");
    expect(document.info.description).toMatch(/CRMini/);
    expect(document.servers).toEqual([{ url: "/" }]);
  });

  it("cobre exatamente as 17 rotas documentadas", () => {
    expect(Object.keys(document.paths).sort()).toEqual(
      [...expectedPaths].sort(),
    );
    expect(Object.keys(document.paths)).toHaveLength(17);
  });

  it("usa tags válidas em todas as operações", () => {
    const validTags = new Set(document.tags.map((tag) => tag.name));

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, operation] of pathOperations(pathItem)) {
        expect(
          operation.tags?.length,
          `${method.toUpperCase()} ${path} sem tags`,
        ).toBeGreaterThan(0);
        for (const tag of operation.tags ?? []) {
          expect(validTags, `${method.toUpperCase()} ${path} usa tag ${tag}`).toContain(
            tag,
          );
        }
      }
    }
  });

  it("tem operationId único e não vazio em todas as operações", () => {
    const ids: string[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, operation] of pathOperations(pathItem)) {
        expect(
          operation.operationId,
          `${method.toUpperCase()} ${path} sem operationId`,
        ).toBeTruthy();
        ids.push(operation.operationId as string);
        expect(operation.summary, `${method.toUpperCase()} ${path} sem summary`)
          .toBeTruthy();
      }
    }

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declara ao menos uma resposta 2xx em cada operação", () => {
    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, operation] of pathOperations(pathItem)) {
        const successCodes = Object.keys(operation.responses ?? {}).filter(
          (status) => status.startsWith("2"),
        );
        expect(
          successCodes.length,
          `${method.toUpperCase()} ${path} sem resposta 2xx`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("declara todos os parâmetros de path em cada operação", () => {
    for (const [path, pathItem] of Object.entries(document.paths)) {
      const pathParams = [...(path.match(/\{([^}]+)\}/g) ?? [])].map((value) =>
        value.slice(1, -1),
      );
      if (pathParams.length === 0) continue;

      for (const [method, operation] of pathOperations(pathItem)) {
        const declared = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
        for (const name of pathParams) {
          const parameter = declared.find(
            (candidate) => candidate.in === "path" && candidate.name === name,
          );
          expect(
            parameter,
            `${method.toUpperCase()} ${path} sem parâmetro ${name}`,
          ).toBeDefined();
          expect(parameter?.required).toBe(true);
        }
      }
    }
  });

  it("resolve todos os $ref para schemas existentes", () => {
    const refs: string[] = [];
    collectRefs(document.paths, refs);
    collectRefs(document.components.schemas, refs);

    expect(refs.length).toBeGreaterThan(0);
    for (const reference of refs) {
      expect(reference.startsWith("#/components/schemas/")).toBe(true);
      const name = reference.slice("#/components/schemas/".length);
      expect(
        document.components.schemas[name],
        `$ref não resolvido: ${reference}`,
      ).toBeDefined();
    }
  });

  it("não usa a palavra-chave nullable e mantém tipos e required válidos", () => {
    const allowedTypes = new Set([
      "string",
      "number",
      "integer",
      "boolean",
      "object",
      "array",
      "null",
    ]);

    function walk(value: unknown, path: string): void {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      if (typeof value !== "object" || value === null) return;

      const node = value as Record<string, unknown>;
      expect(
        Object.prototype.hasOwnProperty.call(node, "nullable"),
        `${path} usa a palavra-chave nullable`,
      ).toBe(false);

      if (node.type !== undefined) {
        const types = Array.isArray(node.type) ? node.type : [node.type];
        expect(types.length, `${path}.type vazio`).toBeGreaterThan(0);
        for (const type of types) {
          expect(typeof type, `${path}.type deve ser string`).toBe("string");
          expect(
            allowedTypes.has(type as string),
            `${path}.type inválido: ${String(type)}`,
          ).toBe(true);
        }
      }

      if (Array.isArray(node.required)) {
        expect(node.properties, `${path}.required sem properties`).toBeDefined();
        const properties = Object.keys(
          (node.properties as Record<string, unknown>) ?? {},
        );
        for (const name of node.required) {
          expect(properties, `${path}.required contém ${String(name)}`).toContain(
            name,
          );
        }
      }

      for (const [key, child] of Object.entries(node)) {
        walk(child, `${path}.${key}`);
      }
    }

    walk(document, "document");
  });

  it("usa os enums de domínio reais nas oportunidades", () => {
    expect(propertyEnum("Opportunity", "status")).toEqual([
      "Em andamento",
      "Desenvolvimento",
      "Proposta",
      "Aceite da proposta",
      "Ganha",
      "Perdida",
    ]);
    expect(propertyEnum("Opportunity", "loss_reason")).toEqual([
      "Preço",
      "Prazo",
      "Tecnologia",
      "Solução",
    ]);
    expect(propertyEnum("Opportunity", "currency")).toEqual([
      "BRL",
      "USD",
      "EUR",
      "PES",
    ]);
    expect(propertyEnum("Opportunity", "budget_currency")).toEqual([
      "BRL",
      "USD",
      "EUR",
      "PES",
    ]);
  });

  it("usa os enums reais de tarefas", () => {
    expect(propertyEnum("Task", "contact_type")).toEqual([
      "email",
      "telefone",
      "compromisso",
    ]);
    expect(propertyEnum("Task", "status")).toEqual(["Aberto", "Concluído"]);
    expect(propertyEnum("TaskCreate", "contact_type")).toEqual([
      "email",
      "telefone",
      "compromisso",
    ]);
    expect(propertyEnum("TaskStatusUpdate", "status")).toEqual([
      "Aberto",
      "Concluído",
    ]);
  });

  it("usa os mesmos tipos de evento da validação real", () => {
    expect(propertyEnum("Event", "event_type")).toEqual([...eventTypes]);
    expect(propertyEnum("EventCreate", "event_type")).toEqual([...eventTypes]);
    expect(propertyEnum("EventUpdate", "event_type")).toEqual([...eventTypes]);
  });

  it("declara os schemas exigidos pela documentação", () => {
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        "ErrorResponse",
        "Client",
        "Contact",
        "Opportunity",
        "Task",
        "Event",
        "Settings",
        "CepAddress",
        "ContactImportRequest",
        "ContactImportResponse",
        "CompanyProfile",
        "LogoUploadResponse",
      ]),
    );
  });
});
