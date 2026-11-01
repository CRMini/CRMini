import { describe, expect, it } from "vitest";
import {
  LINKEDIN_CSV_LIMITS,
  LinkedInCsvError,
  isLinkedInConnectionImportable,
  normalizeCompanyKey,
  normalizeEmailKey,
  normalizeLinkedInProfileUrl,
  parseConnectedOn,
  parseCsv,
  parseLinkedInConnectionsCsv,
} from "./linkedin-connections";

const PREAMBLE = [
  "Notes:",
  '"Texto de ajuda exportado pelo LinkedIn."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
].join("\n");

function csv(...rows: string[]) {
  return [PREAMBLE, ...rows].join("\n");
}

describe("parseCsv", () => {
  it("aceita aspas, aspas escapadas, vírgulas e quebras de linha dentro do campo", () => {
    const rows = parseCsv('a,"b, c","d""e","f\ng"\r\nh,i', ",");
    expect(rows).toEqual([["a", "b, c", 'd"e', "f\ng"], ["h", "i"]]);
  });

  it("remove BOM e aceita delimitador alternativo", () => {
    expect(parseCsv("\uFEFFa;b\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("rejeita aspas não fechadas", () => {
    expect(() => parseCsv('a,"b', ",")).toThrow(LinkedInCsvError);
  });
});

describe("parseLinkedInConnectionsCsv", () => {
  it("ignora o preâmbulo, remove BOM e mapeia os campos", () => {
    const text = `\uFEFF${csv(
      "Ana,Souza,https://www.linkedin.com/in/ana-souza,ana@example.com,Acme Ltda.,Product Manager,31 Oct 2026",
      "Bruno,Lima,https://www.linkedin.com/in/bruno-lima,,Acme Ltda.,,1 Jan 2020",
    )}`;

    const result = parseLinkedInConnectionsCsv(text);

    expect(result.delimiter).toBe(",");
    expect(result.rowsRead).toBe(2);
    expect(result.invalidCount).toBe(0);
    expect(result.connections[0]).toMatchObject({
      rowId: 1,
      fullName: "Ana Souza",
      company: "Acme Ltda.",
      jobTitle: "Product Manager",
      email: "ana@example.com",
      linkedinUrl: "https://www.linkedin.com/in/ana-souza",
      connectedOn: "2026-10-31",
      issues: [],
    });
    expect(result.connections[1]).toMatchObject({
      rowId: 2,
      fullName: "Bruno Lima",
      jobTitle: null,
      email: null,
      connectedOn: "2020-01-01",
    });
  });

  it("mantém campos citados com vírgula e aspas", () => {
    const result = parseLinkedInConnectionsCsv(
      csv(
        'Ana,Souza,https://www.linkedin.com/in/ana,ana@example.com,"Acme, Inc.","Gerente ""Sênior""",31 Oct 2026',
      ),
    );

    expect(result.connections[0].company).toBe("Acme, Inc.");
    expect(result.connections[0].jobTitle).toBe('Gerente "Sênior"');
  });

  it("detecta o delimitador ponto e vírgula", () => {
    const text = [
      "Notes:",
      "",
      "First Name;Last Name;URL;Email Address;Company;Position;Connected On",
      "Ana;Souza;https://www.linkedin.com/in/ana;;Acme;Analista;31 Oct 2026",
    ].join("\n");

    const result = parseLinkedInConnectionsCsv(text);

    expect(result.delimiter).toBe(";");
    expect(result.connections[0]).toMatchObject({
      fullName: "Ana Souza",
      company: "Acme",
    });
  });

  it("mapeia colunas pela posição do cabeçalho, aceitando reordenação", () => {
    const text = [
      "Company,First Name,Last Name,Position,URL,Email Address,Connected On",
      "Acme,Ana,Souza,Analista,https://www.linkedin.com/in/ana,ana@example.com,31 Oct 2026",
    ].join("\n");

    const result = parseLinkedInConnectionsCsv(text);

    expect(result.connections[0]).toMatchObject({
      fullName: "Ana Souza",
      company: "Acme",
      jobTitle: "Analista",
      email: "ana@example.com",
    });
  });

  it("aceita registro com menos colunas que o cabeçalho", () => {
    const result = parseLinkedInConnectionsCsv(csv("Ana,Souza"));

    expect(result.connections[0]).toMatchObject({
      fullName: "Ana Souza",
      company: "",
      email: null,
      linkedinUrl: null,
    });
    expect(result.connections[0].issues.map((item) => item.code)).toContain(
      "missing_company",
    );
  });

  it("sinaliza nome ausente, nome longo, empresa ausente, e-mail e URL inválidos e cargo truncado", () => {
    const longName = "N".repeat(201);
    const longPosition = "P".repeat(250);
    const result = parseLinkedInConnectionsCsv(
      csv(
        `,,https://www.linkedin.com/in/souza,,Acme,,31 Oct 2026`,
        `${longName},X,,,Acme,,31 Oct 2026`,
        `Ana,Souza,https://example.com/ana,email-invalido,,${longPosition},31 Oct 2026`,
      ),
    );

    expect(result.connections[0].issues.map((item) => item.code)).toEqual([
      "missing_name",
    ]);
    expect(result.connections[1].issues.map((item) => item.code)).toEqual([
      "name_too_long",
    ]);
    expect(result.connections[2].issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "missing_company",
        "invalid_email",
        "invalid_url",
        "position_truncated",
      ]),
    );
    expect(result.connections[2].jobTitle).toHaveLength(200);
    expect(result.invalidCount).toBe(2);
  });

  it("marca data inválida sem interromper a leitura", () => {
    const result = parseLinkedInConnectionsCsv(
      csv("Ana,Souza,,,Acme,,31 Feb 2026"),
    );

    expect(result.connections[0].connectedOn).toBeNull();
    expect(result.connections[0].issues.map((item) => item.code)).toContain(
      "invalid_date",
    );
  });

  it("marca duplicados dentro do arquivo pela URL ou e-mail", () => {
    const result = parseLinkedInConnectionsCsv(
      csv(
        "Ana,Souza,https://www.linkedin.com/in/ana,ana@example.com,Acme,,31 Oct 2026",
        "Ana,Souza,https://www.linkedin.com/in/ana/,,Acme,,31 Oct 2026",
        "Outra,Pessoa,,ana@example.com,Acme,,31 Oct 2026",
      ),
    );

    expect(result.connections[1].issues.map((item) => item.code)).toContain(
      "duplicate_in_file",
    );
    expect(result.connections[2].issues.map((item) => item.code)).toContain(
      "duplicate_in_file",
    );
    expect(isLinkedInConnectionImportable(result.connections[1])).toBe(false);
  });

  it("ignora linhas totalmente vazias", () => {
    const result = parseLinkedInConnectionsCsv(
      csv("", "Ana,Souza,,,Acme,,31 Oct 2026", ""),
    );

    expect(result.rowsRead).toBe(1);
    expect(result.connections).toHaveLength(1);
  });

  it("rejeita arquivo vazio, sem cabeçalho e com aspas abertas", () => {
    expect(() => parseLinkedInConnectionsCsv("")).toThrowError(
      expect.objectContaining({ code: "empty_file" }),
    );
    expect(() =>
      parseLinkedInConnectionsCsv("nome,empresa\nAna,Acme"),
    ).toThrowError(expect.objectContaining({ code: "no_header" }));
    expect(() =>
      parseLinkedInConnectionsCsv(
        'First Name,Last Name,Company\nAna,"Souza,Acme',
      ),
    ).toThrowError(expect.objectContaining({ code: "unclosed_quote" }));
  });

  it("rejeita arquivo acima do limite de conexões", () => {
    const rows = Array.from(
      { length: LINKEDIN_CSV_LIMITS.maxRows + 1 },
      (_, index) => `Pessoa${index},Teste,,,Acme,,31 Oct 2026`,
    );
    const text = [
      "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
      ...rows,
    ].join("\n");

    expect(() => parseLinkedInConnectionsCsv(text)).toThrowError(
      expect.objectContaining({ code: "too_many_rows" }),
    );
  });
});

describe("normalizações", () => {
  it("normaliza a chave da empresa sem remover sufixos", () => {
    expect(normalizeCompanyKey("  São   Paulo Tech ")).toBe("sao paulo tech");
    expect(normalizeCompanyKey("Acme Ltda.")).toBe("acme ltda.");
    expect(normalizeCompanyKey("")).toBe("");
    expect(normalizeCompanyKey(null)).toBe("");
  });

  it("normaliza a chave de e-mail", () => {
    expect(normalizeEmailKey(" Ana@Example.com ")).toBe("ana@example.com");
    expect(normalizeEmailKey("")).toBeNull();
  });

  it("aceita apenas perfis do LinkedIn e remove parâmetros/barra final", () => {
    expect(
      normalizeLinkedInProfileUrl(
        "https://www.linkedin.com/in/Ana-Souza/?trk=abc#top",
      ),
    ).toBe("linkedin.com/in/ana-souza");
    expect(
      normalizeLinkedInProfileUrl("https://linkedin.com/pub/ana-souza"),
    ).toBe("linkedin.com/pub/ana-souza");
    expect(normalizeLinkedInProfileUrl("https://example.com/in/ana")).toBeNull();
    expect(normalizeLinkedInProfileUrl("https://linkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedInProfileUrl("javascript:alert(1)")).toBeNull();
  });

  it("converte a data civil sem deslocar o dia", () => {
    expect(parseConnectedOn("31 Oct 2026")).toBe("2026-10-31");
    expect(parseConnectedOn("1 Jan 2020")).toBe("2020-01-01");
    expect(parseConnectedOn("31 Feb 2026")).toBeNull();
    expect(parseConnectedOn("2026-10-31")).toBeNull();
    expect(parseConnectedOn("")).toBeNull();
  });
});
