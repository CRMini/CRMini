import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { validateEvent } from "@/lib/event-validation";
import {
  deactivateEvent,
  getEvent,
  updateEvent,
} from "@/lib/repositories/events";

export const runtime = "nodejs";

const editableFields = [
  "event_type",
  "title",
  "details",
  "occurred_at",
  "contact_id",
  "opportunity_id",
] as const;

function notFound() {
  return NextResponse.json(
    { error: "Evento não encontrado." },
    { status: 404 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = await readJsonObject<Record<string, unknown>>(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;

  try {
    const current = await getEvent(id);
    if (!current || !current.is_active) return notFound();

    if (
      body.client_id != null &&
      String(body.client_id) !== String(current.client_id)
    ) {
      return NextResponse.json(
        { error: "O cliente do evento não pode ser alterado." },
        { status: 400 },
      );
    }

    if (
      body.is_origin != null &&
      Boolean(body.is_origin) !== Boolean(current.is_origin)
    ) {
      return NextResponse.json(
        { error: "A origem do evento não pode ser alterada." },
        { status: 400 },
      );
    }

    if (
      current.is_origin &&
      body.opportunity_id !== undefined &&
      (body.opportunity_id || null) !== current.opportunity_id
    ) {
      return NextResponse.json(
        { error: "A oportunidade de um evento de origem não pode ser alterada." },
        { status: 400 },
      );
    }

    const merged: Record<string, unknown> = { ...current };
    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        merged[field] = body[field];
      }
    }

    const error = validateEvent(merged);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const updated = await updateEvent(id, merged);
    if (!updated) {
      return NextResponse.json(
        { error: "Cliente, oportunidade ou contato válido não encontrado." },
        { status: 400 },
      );
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível atualizar o evento." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const current = await getEvent(id);
    if (!current) return notFound();

    if (current.is_origin) {
      return NextResponse.json(
        { error: "Eventos de origem não podem ser excluídos." },
        { status: 409 },
      );
    }

    if (!current.is_active) {
      return new NextResponse(null, { status: 204 });
    }

    await deactivateEvent(id);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível excluir o evento." },
      { status: 400 },
    );
  }
}
