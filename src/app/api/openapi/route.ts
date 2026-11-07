import { NextResponse } from "next/server";
import { isApiDocsEnabled } from "@/lib/api-docs";
import { openApiDocument } from "@/lib/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isApiDocsEnabled()) {
    return NextResponse.json(
      { error: "Documentação da API indisponível." },
      { status: 404 },
    );
  }

  return NextResponse.json(openApiDocument, {
    headers: { "Cache-Control": "no-store" },
  });
}
