import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api-json";
import {
  BlockedAddressError,
  discardBody,
  exceedsDeclaredSize,
  fetchGuarded,
  InvalidTargetError,
  readLimitedBody,
  startDeadline,
} from "@/lib/safe-http";
import { toPublicTarget } from "@/lib/safe-url";
import {
  COMPANY_PROFILE_FIELDS,
  extractCompanyProfile,
} from "@/lib/company-profile";

export const runtime = "nodejs";

const totalTimeoutMs = 20000;
const maxPageBytes = 512 * 1024;
const userAgent = "CRMini-CompanyProfile/1.0";

const missingSiteMessage = "Informe o site da empresa.";
const invalidSiteMessage = "Site inválido. Use um endereço http(s) público.";
const blockedAddressMessage = "Esse endereço não pode ser consultado.";
const unreachableMessage =
  "Não foi possível acessar o site. Verifique o endereço ou sua conexão.";
const notFoundMessage = "Nenhum dado cadastral encontrado no site.";

async function fetchPage(
  target: URL,
  deadline: number,
): Promise<{ html: string; url: URL }> {
  const { response, url } = await fetchGuarded(target, {
    accept: "text/html,application/xhtml+xml",
    deadline,
    userAgent,
  });

  if (!response.ok) {
    await discardBody(response);
    throw new Error(`Site respondeu ${response.status}`);
  }

  if (exceedsDeclaredSize(response, maxPageBytes)) {
    await discardBody(response);
    throw new Error("Página do site excede o limite de 512 KB");
  }

  const { bytes } = await readLimitedBody(response, maxPageBytes);
  return { html: new TextDecoder().decode(bytes), url };
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonObject(request, { error: missingSiteMessage });
  if (!parsed.ok) return parsed.response;

  const website = parsed.body.website;
  if (typeof website !== "string" || !website.trim()) {
    return NextResponse.json({ error: missingSiteMessage }, { status: 400 });
  }

  const target = toPublicTarget(website);
  if (!target) {
    return NextResponse.json({ error: invalidSiteMessage }, { status: 400 });
  }

  try {
    const deadline = startDeadline(totalTimeoutMs);
    const page = await fetchPage(target, deadline);
    const profile = extractCompanyProfile(page.html, page.url.href);

    if (Object.keys(profile.fields).length === 0) {
      return NextResponse.json({ error: notFoundMessage }, { status: 404 });
    }

    const found = new Set(Object.keys(profile.fields));
    const missing = COMPANY_PROFILE_FIELDS.filter((key) => !found.has(key));

    return NextResponse.json({
      source_url: page.url.href,
      fields: profile.fields,
      missing,
    });
  } catch (error) {
    if (error instanceof InvalidTargetError) {
      return NextResponse.json({ error: invalidSiteMessage }, { status: 400 });
    }
    if (error instanceof BlockedAddressError) {
      return NextResponse.json(
        { error: blockedAddressMessage },
        { status: 400 },
      );
    }

    console.error("Failed to fetch company profile", error);
    return NextResponse.json({ error: unreachableMessage }, { status: 502 });
  }
}
