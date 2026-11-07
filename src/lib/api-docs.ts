/** Versão do Scalar fixada para evitar quebra por atualizações do CDN. */
export const SCALAR_CDN_VERSION = "1.77.0";

/** SRI do bundle do Scalar servido pelo jsDelivr para a versão fixada acima. */
export const SCALAR_CDN_INTEGRITY =
  "sha384-+7ESN8b9Ljg46TCYKedZUlhF/wfZbOt78aV/DtoU3anEElh8Q2eXsyhQ9W5lAZD4";

/**
 * A documentação interativa só existe em desenvolvimento e nos testes.
 *
 * Usar uma lista explícita (em vez de "tudo que não é produção") importa: no
 * aplicativo Electron empacotado o `process.env.NODE_ENV` do processo que
 * inicia o servidor standalone não é garantido como "production", e a
 * documentação não deve aparecer para quem usa o CRM.
 */
export function isApiDocsEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Garante que a especificação venha da própria aplicação. Sem isso, um valor
 * como `//outro-host` ou `javascript:` chegaria ao `data-url`/`href` do HTML.
 */
function safeSpecPath(specUrl: string): string {
  if (!specUrl.startsWith("/") || specUrl.startsWith("//")) {
    throw new Error(
      "A especificação da API deve ser um caminho relativo da aplicação.",
    );
  }
  return escapeHtmlAttribute(specUrl);
}

/**
 * Monta o documento HTML do visualizador Scalar.
 *
 * O visualizador roda em um iframe com `srcdoc` (ver `api-docs/page.tsx`) para
 * não hidratar DOM de terceiros dentro da árvore do React. O script do CDN é
 * fixado em `SCALAR_CDN_VERSION`; se ele não carregar, o bloco `#fallback`
 * aparece com o link para baixar a especificação local.
 */
export function buildScalarHtml(specUrl: string): string {
  const safeSpecUrl = safeSpecPath(specUrl);
  // Evita o fechamento literal de script dentro do template literal.
  const CLOSE_SCRIPT = "</" + "script>";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CRMini API</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
      }
      #fallback {
        padding: 32px;
        color: #171717;
        font-family: "DM Sans", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
      }
      #fallback h1 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      #fallback a {
        color: #398653;
      }
    </style>
  </head>
  <body>
    <!--
      Este HTML é carregado em um iframe com o atributo srcdoc. Assim o
      visualizador de terceiros (Scalar) não injeta DOM dentro da árvore do
      React.
    -->
    <div id="fallback" hidden>
      <h1>Visualizador da documentação indisponível</h1>
      <p>
        O visualizador da documentação precisa de acesso à internet para
        carregar o Scalar. A especificação OpenAPI continua disponível
        localmente em JSON.
      </p>
      <p>
        <a href="${safeSpecUrl}">Abrir a especificação OpenAPI em JSON</a>
      </p>
    </div>
    <script id="api-reference" data-url="${safeSpecUrl}">${CLOSE_SCRIPT}
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_CDN_VERSION}/dist/browser/standalone.min.js"
      integrity="${SCALAR_CDN_INTEGRITY}"
      crossorigin="anonymous"
      onerror="document.getElementById('fallback').hidden = false"
    >${CLOSE_SCRIPT}
  </body>
</html>`;
}
