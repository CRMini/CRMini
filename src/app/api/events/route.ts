import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { getBrazilDateString } from "@/lib/brazil-date";
import {
  eventTypes,
  type EventType,
  validateEvent,
} from "@/lib/event-validation";
import { createEvent, listEvents } from "@/lib/repositories/events";

export const runtime = "nodejs";

function parseLimit(rawLimit: string | null): number | null | "invalid" {
  if (rawLimit == null || rawLimit === "") return null;

  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return "invalid";
  }

  return limit;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const clientId = searchParams.get("client_id")?.trim() || null;
  const opportunityId = searchParams.get("opportunity_id")?.trim() || null;

  if (!clientId && !opportunityId) {
    return NextResponse.json(
      { error: "Informe o cliente ou a oportunidade." },
      { status: 400 },
    );
  }

  const type = searchParams.get("type")?.trim() || null;
  if (type && !eventTypes.includes(type as EventType)) {
    return NextResponse.json(
      { error: "Tipo de evento inválido." },
      { status: 400 },
    );
  }

  const limit = parseLimit(searchParams.get("limit"));
  if (limit === "invalid") {
    return NextResponse.json(
      { error: "Limite inválido." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await listEvents({ clientId, opportunityId, type, limit }),
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar o histórico." },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject<Record<string, unknown>>(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;

  const body = { ...parsed.body };
  if (body.occurred_at == null || body.occurred_at === "") {
    body.occurred_at = getBrazilDateString();
  }

  const error = validateEvent(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const created = await createEvent(body);
    if (!created) {
      return NextResponse.json(
        { error: "Cliente, oportunidade ou contato válido não encontrado." },
        { status: 400 },
      );
    }
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível cadastrar o evento." },
      { status: 400 },
    );
  }
}
