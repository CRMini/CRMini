import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { deactivateContact, getContact, reactivateContact, updateContact } from "@/lib/repositories/contacts";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const contact = await getContact(id);
    return contact ? NextResponse.json(contact) : NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  } catch (error) {
    console.error("Failed to load contact", error);
    return NextResponse.json({ error: "Não foi possível carregar o contato." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJsonObject(request, {
    error: "Dados inválidos.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.full_name !== "string" || !body.full_name.trim())
    return NextResponse.json({ error: "Informe o nome do contato." }, { status: 400 });
  try {
    const contact = await updateContact(id, body);
    return contact ? NextResponse.json(contact) : NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  } catch (error) {
    console.error("Failed to update contact", error);
    return NextResponse.json({ error: "Não foi possível atualizar o contato." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJsonObject(request, {
    error: "Dados inválidos.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.is_active !== "boolean") return NextResponse.json({ error: "Informe se o contato está ativo." }, { status: 400 });
  try {
    if (!(await getContact(id)))
      return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    const found = body.is_active ? await reactivateContact(id) : await deactivateContact(id);
    if (!found) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    const contact = await getContact(id);
    return contact ? NextResponse.json(contact) : NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  } catch (error) {
    console.error("Failed to change contact status", error);
    return NextResponse.json({ error: "Não foi possível atualizar o status do contato." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!(await deactivateContact(id))) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to deactivate contact", error);
    return NextResponse.json({ error: "Não foi possível desativar o contato." }, { status: 500 });
  }
}
