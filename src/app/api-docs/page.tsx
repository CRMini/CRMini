import { notFound } from "next/navigation";
import { buildScalarHtml, isApiDocsEnabled } from "@/lib/api-docs";

export const dynamic = "force-dynamic";

export default function ApiDocsPage() {
  if (!isApiDocsEnabled()) notFound();

  return (
    <main className="api-docs-page">
      <div className="api-docs-toolbar">
        <p>Documentação da API — disponível apenas em desenvolvimento.</p>
        <a href="/api/openapi">Ver especificação</a>
      </div>
      <iframe
        className="api-docs-frame"
        title="Documentação da API"
        srcDoc={buildScalarHtml("/api/openapi")}
      />
    </main>
  );
}
