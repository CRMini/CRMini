import { NextRequest, NextResponse } from "next/server";
import { isValidCep, normalizeCep, parseViaCepPayload } from "@/lib/cep";

export const runtime = "nodejs";

const viaCepTimeoutMs = 5000;

export async function GET(request: NextRequest) {
  const rawCep = request.nextUrl.searchParams.get("cep") ?? "";

  if (!rawCep.trim()) {
    return NextResponse.json({ error: "Informe o CEP." }, { status: 400 });
  }

  if (!isValidCep(rawCep)) {
    return NextResponse.json(
      { error: "CEP inválido. Informe os 8 dígitos." },
      { status: 400 },
    );
  }

  const cep = normalizeCep(rawCep);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(viaCepTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`ViaCEP respondeu ${response.status}`);
    }

    const address = parseViaCepPayload(await response.json(), cep);

    if (!address) {
      return NextResponse.json(
        { error: "CEP não encontrado. Confira o número informado." },
        { status: 404 },
      );
    }

    return NextResponse.json(address);
  } catch (error) {
    console.error("Failed to look up CEP", error);
    return NextResponse.json(
      { error: "Não foi possível consultar o CEP. Tente novamente." },
      { status: 502 },
    );
  }
}
