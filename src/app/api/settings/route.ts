import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import { getUserName, saveUserName } from "@/lib/repositories/settings";
import { normalizeUserName, validateUserName } from "@/lib/user-name";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ userName: await getUserName() });
  } catch (error) {
    console.error("Failed to load settings", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as configurações." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const parsed = await readJsonObject(request, {
    error: "Corpo JSON inválido.",
    shapeError: "Dados inválidos.",
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const { userName } = body as { userName?: unknown };
  if (typeof userName !== "string")
    return NextResponse.json(
      { error: "Nome do usuário inválido." },
      { status: 400 },
    );
  const validationError = validateUserName(userName);
  if (validationError)
    return NextResponse.json({ error: validationError }, { status: 400 });

  const storedName = normalizeUserName(userName) || null;
  try {
    await saveUserName(storedName);
    return NextResponse.json({ userName: storedName });
  } catch (error) {
    console.error("Failed to save settings", error);
    return NextResponse.json(
      { error: "Não foi possível salvar as configurações." },
      { status: 500 },
    );
  }
}
