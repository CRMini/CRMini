import { describe, expect, it } from "vitest";
import {
  COMPANY_PROFILE_FIELDS,
  extractCompanyProfile,
} from "./company-profile";

const baseUrl = "https://acme.com.br/";

function extract(html: string, base: string = baseUrl) {
  return extractCompanyProfile(html, base).fields;
}

function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function organization(extra: Record<string, unknown> = {}) {
  return { "@context": "https://schema.org", "@type": "Organization", ...extra };
}

describe("extractCompanyProfile — JSON-LD", () => {
  const fullOrganization = organization({
    legalName: "Acme Comércio Ltda",
    alternateName: "Acme",
    taxID: "11.222.333/0001-81",
    telephone: "(11) 3456-7890",
    email: "contato@acme.com.br",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Av. Paulista, 1000 A",
      addressLocality: "São Paulo",
      addressRegion: "SP",
      postalCode: "01310-100",
      addressCountry: "BR",
    },
  });

  it("extrai todos os campos de uma Organization completa", () => {
    expect(extract(jsonLdScript(fullOrganization))).toEqual({
      company_name: {
        value: "Acme Comércio Ltda",
        source: "json-ld",
        confidence: "high",
      },
      trade_name: {
        value: "Acme",
        source: "json-ld",
        confidence: "medium",
      },
      tax_id: {
        value: "11.222.333/0001-81",
        source: "json-ld",
        confidence: "high",
      },
      phone: {
        value: "(11) 3456-7890",
        source: "json-ld",
        confidence: "high",
      },
      email: {
        value: "contato@acme.com.br",
        source: "json-ld",
        confidence: "high",
      },
      postal_code: {
        value: "01310-100",
        source: "json-ld",
        confidence: "high",
      },
      street: {
        value: "Av. Paulista",
        source: "json-ld",
        confidence: "medium",
      },
      street_number: {
        value: "1000 A",
        source: "json-ld",
        confidence: "medium",
      },
      city: {
        value: "São Paulo",
        source: "json-ld",
        confidence: "high",
      },
      state: { value: "SP", source: "json-ld", confidence: "high" },
      country: { value: "Brasil", source: "json-ld", confidence: "high" },
    });
  });

  it("encontra a organização no meio de nós irrelevantes de @graph", () => {
    const html = jsonLdScript({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "BreadcrumbList", itemListElement: [] },
        { "@type": "WebSite", name: "Site da Acme" },
        { "@type": "NGO", name: "Acme ONG" },
        { "@type": "WebPage", name: "Contato" },
      ],
    });

    expect(extract(html)).toEqual({
      company_name: { value: "Acme ONG", source: "json-ld", confidence: "high" },
    });
  });

  it("lê JSON-LD declarado como array de nós", () => {
    const html = jsonLdScript([
      { "@type": "WebSite", name: "Site" },
      { "@type": "Corporation", name: "Acme SA" },
    ]);

    expect(extract(html)).toEqual({
      company_name: { value: "Acme SA", source: "json-ld", confidence: "high" },
    });
  });

  it("tolera o primeiro bloco JSON inválido e usa o segundo", () => {
    const html = [
      '<script type="application/ld+json">{ nao e json </script>',
      jsonLdScript(organization({ name: "Acme" })),
    ].join("");

    expect(extract(html)).toEqual({
      company_name: { value: "Acme", source: "json-ld", confidence: "high" },
    });
  });

  it("ignora JSON-LD com @type irrelevante", () => {
    expect(
      extract(jsonLdScript({ "@type": "WebSite", name: "Acme" })),
    ).toEqual({});
  });

  it("usa name quando legalName não existe", () => {
    expect(extract(jsonLdScript(organization({ name: "Acme Fantasia" })))).toEqual({
      company_name: {
        value: "Acme Fantasia",
        source: "json-ld",
        confidence: "high",
      },
    });
  });

  it("aceita identifier como objeto PropertyValue", () => {
    const html = jsonLdScript(
      organization({
        name: "Acme",
        identifier: { "@type": "PropertyValue", value: "11.222.333/0001-81" },
      }),
    );

    expect(extract(html).tax_id).toEqual({
      value: "11.222.333/0001-81",
      source: "json-ld",
      confidence: "high",
    });
  });

  it("aceita identifier como string", () => {
    const html = jsonLdScript(
      organization({ name: "Acme", identifier: "11222333000181" }),
    );

    expect(extract(html).tax_id).toEqual({
      value: "11.222.333/0001-81",
      source: "json-ld",
      confidence: "high",
    });
  });

  it("descarta identifier que não é CNPJ válido", () => {
    const html = jsonLdScript(
      organization({ name: "Acme", taxID: "11.222.333/0001-82" }),
    );

    expect(extract(html).tax_id).toBeUndefined();
  });

  it("extrai o telefone de JSON-LD com prefixo +55 como json-ld/high", () => {
    const html = jsonLdScript(
      organization({ name: "Acme", telephone: "+55 11 91234-5678" }),
    );

    expect(extract(html).phone).toEqual({
      value: "(11) 91234-5678",
      source: "json-ld",
      confidence: "high",
    });
  });
});

describe("extractCompanyProfile — OpenGraph e microdata", () => {
  it("usa og:site_name quando não há JSON-LD", () => {
    const html =
      '<meta property="og:site_name" content="Acme &amp; Filhos"><title>Home | Acme</title>';

    expect(extract(html)).toEqual({
      company_name: {
        value: "Acme & Filhos",
        source: "opengraph",
        confidence: "medium",
      },
    });
  });

  it("não usa <title> como nome da empresa", () => {
    expect(extract("<title>Home | Acme — Soluções em TI</title>")).toEqual({});
  });

  it("extrai itemprop=name dentro de itemtype de organização", () => {
    const html =
      '<div itemtype="https://schema.org/Organization"><span itemprop="name">Acme Ltda</span></div>';

    expect(extract(html)).toEqual({
      company_name: {
        value: "Acme Ltda",
        source: "microdata",
        confidence: "medium",
      },
    });
  });

  it("não usa itemprop=name sem itemtype de organização", () => {
    expect(extract('<span itemprop="name">Acme Ltda</span>')).toEqual({});
  });

  it("lê telefone do texto de itemprop=telephone", () => {
    const html = '<span itemprop="telephone">(11) 3456-7890</span>';

    expect(extract(html)).toEqual({
      phone: {
        value: "(11) 3456-7890",
        source: "microdata",
        confidence: "medium",
      },
    });
  });

  it("lê CEP do atributo content de itemprop=postalCode", () => {
    const html = '<meta itemprop="postalCode" content="01310-100">';

    expect(extract(html)).toEqual({
      postal_code: {
        value: "01310-100",
        source: "microdata",
        confidence: "medium",
      },
    });
  });

  it("lê streetAddress em texto e separa o número", () => {
    const html = '<span itemprop="streetAddress">Rua das Flores, 123</span>';

    expect(extract(html)).toEqual({
      street: {
        value: "Rua das Flores",
        source: "microdata",
        confidence: "medium",
      },
      street_number: {
        value: "123",
        source: "microdata",
        confidence: "medium",
      },
    });
  });
});

describe("extractCompanyProfile — links", () => {
  it("extrai telefone de href tel: com número local", () => {
    expect(extract('<a href="tel:1134567890">Ligue</a>')).toEqual({
      phone: {
        value: "(11) 3456-7890",
        source: "links",
        confidence: "medium",
      },
    });
  });

  it("extrai o número de href tel: com prefixo +55", () => {
    expect(extract('<a href="tel:+5511912345678">Ligue</a>').phone).toEqual({
      value: "(11) 91234-5678",
      source: "links",
      confidence: "medium",
    });
  });

  it("extrai e-mail de mailto: ignorando o assunto da query", () => {
    const html =
      '<a href="mailto:contato@acme.com.br?subject=x">Fale conosco</a>';

    expect(extract(html)).toEqual({
      email: {
        value: "contato@acme.com.br",
        source: "links",
        confidence: "medium",
      },
    });
  });
});

describe("extractCompanyProfile — e-mail", () => {
  it("prefere o e-mail do domínio do site mesmo com terceiro no JSON-LD", () => {
    const html = [
      jsonLdScript(organization({ name: "Acme", email: "sac@parceiro.com" })),
      '<a href="mailto:Contato@ACME.com.br">Fale conosco</a>',
    ].join("");

    expect(extract(html).email).toEqual({
      value: "contato@acme.com.br",
      source: "links",
      confidence: "medium",
    });
  });

  it("aceita subdomínio do domínio do site", () => {
    expect(extract('<a href="mailto:ti@mail.acme.com.br">x</a>').email).toEqual({
      value: "ti@mail.acme.com.br",
      source: "links",
      confidence: "medium",
    });
  });

  it.each([
    ["caixa de não-resposta", '<a href="mailto:no-reply@acme.com.br">x</a>'],
    ["domínio de exemplo", '<a href="mailto:contato@example.com">x</a>'],
    ["domínio de hospedagem", '<a href="mailto:contato@acme.wixsite.com">x</a>'],
  ])("descarta e-mail de %s", (_label, html) => {
    expect(extract(html)).toEqual({});
  });
});

describe("extractCompanyProfile — CNPJ no texto", () => {
  it("extrai e mascara o CNPJ visível", () => {
    expect(extract("<p>CNPJ: 11.222.333/0001-81</p>")).toEqual({
      tax_id: {
        value: "11.222.333/0001-81",
        source: "text",
        confidence: "medium",
      },
    });
  });

  it("descarta CNPJ com dígito verificador inválido", () => {
    expect(extract("<p>CNPJ: 11.222.333/0001-82</p>")).toEqual({});
  });

  it("aceita CNPJ alfanumérico no texto", () => {
    expect(extract("<p>CNPJ: 12.ABC.345/01DE-35</p>")).toEqual({
      tax_id: {
        value: "12.ABC.345/01DE-35",
        source: "text",
        confidence: "medium",
      },
    });
  });
});

describe("extractCompanyProfile — telefone no texto", () => {
  it.each([
    ["celular com máscara", "(11) 91234-5678", "(11) 91234-5678"],
    ["fixo sem parênteses", "11 3456-7890", "(11) 3456-7890"],
    ["internacional com +55", "+55 11 91234-5678", "(11) 91234-5678"],
  ])("extrai telefone %s", (_label, text, expected) => {
    expect(extract(`<p>Telefone: ${text}</p>`)).toEqual({
      phone: { value: expected, source: "text", confidence: "low" },
    });
  });

  it.each([
    ["0800", "0800 123 4567"],
    ["3003", "3003-1234"],
    ["sequência repetida", "(11) 1111-1111"],
  ])("descarta telefone %s", (_label, text) => {
    expect(extract(`<p>Telefone: ${text}</p>`)).toEqual({});
  });

  it.each([
    ["ramal por extenso", "(11) 3456-7890 ramal 123"],
    ["ramal abreviado com x", "(11) 3456-7890 x123"],
  ])("extrai o telefone principal sem o ramal (%s)", (_label, text) => {
    expect(extract(`<p>Telefone: ${text}</p>`)).toEqual({
      phone: { value: "(11) 3456-7890", source: "text", confidence: "low" },
    });
  });

  it("não deriva telefone de um CNPJ no texto", () => {
    const fields = extract("<p>CNPJ 11222333000181</p>");

    expect(fields).toEqual({
      tax_id: {
        value: "11.222.333/0001-81",
        source: "text",
        confidence: "medium",
      },
    });
    expect(fields.phone).toBeUndefined();
  });
});

describe("extractCompanyProfile — endereço", () => {
  function addressFields(address: Record<string, unknown>) {
    return extract(jsonLdScript(organization({ name: "Acme", address })));
  }

  it("separa número com letra ao final do logradouro", () => {
    const fields = addressFields({ streetAddress: "Av. Paulista, 1000 A" });

    expect(fields.street).toEqual({
      value: "Av. Paulista",
      source: "json-ld",
      confidence: "medium",
    });
    expect(fields.street_number).toEqual({
      value: "1000 A",
      source: "json-ld",
      confidence: "medium",
    });
  });

  it("separa número mesmo sem vírgula antes dele", () => {
    const fields = addressFields({ streetAddress: "Rua das Flores 123" });

    expect(fields.street).toEqual({
      value: "Rua das Flores",
      source: "json-ld",
      confidence: "medium",
    });
    expect(fields.street_number).toEqual({
      value: "123",
      source: "json-ld",
      confidence: "medium",
    });
  });

  it("mantém tudo em street e omite street_number sem número ao final", () => {
    const fields = addressFields({ streetAddress: "Centro Empresarial XYZ" });

    expect(fields.street).toEqual({
      value: "Centro Empresarial XYZ",
      source: "json-ld",
      confidence: "medium",
    });
    expect(fields).not.toHaveProperty("street_number");
  });

  it("normaliza UF minúscula e nome de país em inglês", () => {
    const fields = addressFields({
      addressRegion: "sp",
      addressCountry: "Brazil",
    });

    expect(fields.state).toEqual({
      value: "SP",
      source: "json-ld",
      confidence: "high",
    });
    expect(fields.country).toEqual({
      value: "Brasil",
      source: "json-ld",
      confidence: "high",
    });
  });

  it("descarta CEP com 7 dígitos", () => {
    const fields = addressFields({ postalCode: "0131010" });

    expect(fields).not.toHaveProperty("postal_code");
  });

  it("nunca devolve complement", () => {
    const fields = addressFields({
      streetAddress: "Av. Paulista, 1000",
      complement: "Sala 5",
    });

    expect(fields).not.toHaveProperty("complement");
    expect(Object.keys(fields).sort()).toEqual(
      COMPANY_PROFILE_FIELDS.filter((key) => key !== "complement" && fields[key] !== undefined).sort(),
    );
  });
});

describe("extractCompanyProfile — precedência e robustez", () => {
  it("JSON-LD vence OpenGraph e microdata no mesmo campo", () => {
    const html = [
      '<meta property="og:site_name" content="Nome do OpenGraph">',
      '<div itemtype="https://schema.org/Organization">',
      '<span itemprop="name">Nome do Microdata</span>',
      '<span itemprop="telephone">(11) 3456-7890</span>',
      "</div>",
      jsonLdScript(
        organization({ name: "Nome do JSON-LD", telephone: "(21) 99876-5432" }),
      ),
    ].join("");

    const fields = extract(html);

    expect(fields.company_name).toEqual({
      value: "Nome do JSON-LD",
      source: "json-ld",
      confidence: "high",
    });
    expect(fields.phone).toEqual({
      value: "(21) 99876-5432",
      source: "json-ld",
      confidence: "high",
    });
  });

  it("mantém COMPANY_PROFILE_FIELDS na ordem canônica do formulário", () => {
    expect([...COMPANY_PROFILE_FIELDS]).toEqual([
      "company_name",
      "trade_name",
      "tax_id",
      "phone",
      "email",
      "postal_code",
      "street",
      "street_number",
      "city",
      "state",
      "country",
    ]);
  });

  it("não devolve campo fora da lista canônica", () => {
    const html = jsonLdScript(
      organization({
        legalName: "Acme Comércio Ltda",
        alternateName: "Acme",
        taxID: "11.222.333/0001-81",
        telephone: "(11) 3456-7890",
        email: "contato@acme.com.br",
        industry: "Tecnologia",
        notes: "não deve vazar",
        address: {
          streetAddress: "Av. Paulista, 1000 A",
          complement: "Sala 5",
          addressLocality: "São Paulo",
          addressRegion: "SP",
          postalCode: "01310-100",
          addressCountry: "BR",
        },
      }),
    );

    expect(Object.keys(extract(html)).sort()).toEqual(
      [...COMPANY_PROFILE_FIELDS].sort(),
    );
  });

  it("decodifica entidades HTML dos valores", () => {
    const html =
      '<div itemtype="https://schema.org/Organization"><span itemprop="name">Acme &amp; Filhos &#39;X&#39;</span><span itemprop="streetAddress">Rua D&#39;Ávila, 100</span></div>';

    expect(extract(html)).toEqual({
      company_name: {
        value: "Acme & Filhos 'X'",
        source: "microdata",
        confidence: "medium",
      },
      street: {
        value: "Rua D'Ávila",
        source: "microdata",
        confidence: "medium",
      },
      street_number: {
        value: "100",
        source: "microdata",
        confidence: "medium",
      },
    });
  });

  it("devolve fields vazio quando a base é inválida", () => {
    const html = jsonLdScript(organization({ name: "Acme" }));

    expect(extractCompanyProfile(html, "nao e url")).toEqual({ fields: {} });
    expect(extractCompanyProfile(html, "")).toEqual({ fields: {} });
  });

  it("devolve fields vazio para HTML vazio", () => {
    expect(extract("")).toEqual({});
  });
});
