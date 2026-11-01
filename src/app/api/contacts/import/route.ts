import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { isValidEmail } from "@/lib/email";
import {
  createContactsBatch,
  planContactImport,
  type ContactImportInput,
} from "@/lib/repositories/contacts";
import { normalizeLinkedInProfileUrl } from "@/lib/linkedin-connections";

export const runtime = "nodejs";

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function normalizedOptional(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request, {
    error: "Dados inválidos.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const { dryRun: dryRunValue, items: rawItems } = body;

  if (dryRunValue !== undefined && typeof dryRunValue !== "boolean") {
    return NextResponse.json(
      { error: "O campo dryRun deve ser booleano." },
      { status: 400 },
    );
  }
  const dryRun = dryRunValue === true;

  if (!Array.isArray(rawItems)) {
    return NextResponse.json(
      { error: "Informe a lista de itens." },
      { status: 400 },
    );
  }
  if (rawItems.length < 1 || rawItems.length > 1000) {
    return NextResponse.json(
      { error: "A lista de itens deve ter entre 1 e 1000 contatos." },
      { status: 400 },
    );
  }

  const items: ContactImportInput[] = [];
  for (const rawItem of rawItems) {
    if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
      return NextResponse.json(
        { error: "Cada item deve ser um objeto." },
        { status: 400 },
      );
    }
    const item = rawItem as Record<string, unknown>;
    if (typeof item.rowId !== "number" || !Number.isFinite(item.rowId)) {
      return NextResponse.json(
        { error: "O campo rowId deve ser um número." },
        { status: 400 },
      );
    }
    if (typeof item.clientId !== "string" || !item.clientId.trim()) {
      return NextResponse.json(
        { error: "O campo clientId deve ser uma string não vazia." },
        { status: 400 },
      );
    }
    if (typeof item.fullName !== "string") {
      return NextResponse.json(
        { error: "O campo fullName deve ser uma string." },
        { status: 400 },
      );
    }
    if (
      !isOptionalString(item.jobTitle) ||
      !isOptionalString(item.email) ||
      !isOptionalString(item.linkedinUrl)
    ) {
      return NextResponse.json(
        { error: "Os campos opcionais devem ser string ou null." },
        { status: 400 },
      );
    }

    const jobTitle = normalizedOptional(item.jobTitle);
    if (jobTitle && jobTitle.length > 200) {
      return NextResponse.json(
        { error: "O cargo deve ter no máximo 200 caracteres." },
        { status: 400 },
      );
    }

    const email = normalizedOptional(item.email);
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }

    const linkedinUrl = normalizedOptional(item.linkedinUrl);
    if (linkedinUrl && !normalizeLinkedInProfileUrl(linkedinUrl)) {
      return NextResponse.json(
        { error: "Perfil do LinkedIn inválido." },
        { status: 400 },
      );
    }

    items.push({
      rowId: item.rowId,
      clientId: item.clientId.trim(),
      fullName: item.fullName,
      jobTitle,
      email,
      linkedinUrl,
    });
  }

  try {
    const outcomes = dryRun
      ? await planContactImport(items)
      : await createContactsBatch(items);

    const imported = outcomes.filter((outcome) => outcome.status === "imported").length;
    const wouldImport = outcomes.filter(
      (outcome) => outcome.status === "would_import",
    ).length;
    const skipped = outcomes.length - imported - wouldImport;

    return NextResponse.json({
      dryRun,
      counts: {
        received: outcomes.length,
        imported,
        wouldImport,
        skipped,
      },
      items: outcomes,
    });
  } catch (error) {
    console.error("Failed to import contacts", error);
    return NextResponse.json(
      { error: "Não foi possível importar os contatos." },
      { status: 500 },
    );
  }
}
