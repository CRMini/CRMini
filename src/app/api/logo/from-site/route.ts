import { NextRequest, NextResponse } from "next/server";
import { saveLogo } from "@/lib/logo-assets";
import {
  BlockedAddressError,
  DeadlineExceededError,
  discardBody,
  exceedsDeclaredSize,
  fetchGuarded,
  InvalidTargetError,
  readLimitedBody,
  startDeadline,
} from "@/lib/safe-http";
import { toPublicTarget } from "@/lib/safe-url";
import { extractIconUrls, sniffImageType } from "@/lib/site-logo";

export const runtime = "nodejs";

const totalTimeoutMs = 20000;
const maxPageBytes = 512 * 1024;
const maxImageBytes = 2 * 1024 * 1024;
const maxCandidates = 5;
const userAgent = "CRMini-LogoFinder/1.0";

const invalidSiteMessage = "Site inválido. Use um endereço http(s) público.";
const blockedAddressMessage = "Esse endereço não pode ser consultado.";
const unreachableMessage =
  "Não foi possível acessar o site. Verifique o endereço ou sua conexão.";
const notFoundMessage = "Nenhum logo encontrado no site.";
const unsupportedFormatMessage = "Formato não suportado. Use PNG, JPG ou WebP.";
const tooLargeMessage = "O logo encontrado excede 2 MB.";
const saveErrorMessage =
  "Não foi possível salvar a imagem. Verifique se a pasta do banco está disponível e gravável.";

class TooLargeError extends Error {}

type ImageCandidate =
  | {
      status: "ok";
      bytes: Uint8Array;
      extension: "png" | "jpg" | "webp";
      url: string;
    }
  | { status: "unsupported" }
  | { status: "unavailable" };

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

async function downloadCandidate(
  candidate: string,
  deadline: number,
): Promise<ImageCandidate> {
  let target: URL;
  try {
    target = new URL(candidate);
  } catch {
    return { status: "unavailable" };
  }

  const { response, url } = await fetchGuarded(target, {
    accept: "image/*",
    deadline,
    userAgent,
  });

  if (!response.ok) {
    await discardBody(response);
    return { status: "unavailable" };
  }

  if (
    (response.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("text/html")
  ) {
    await discardBody(response);
    return { status: "unavailable" };
  }

  if (exceedsDeclaredSize(response, maxImageBytes)) {
    await discardBody(response);
    throw new TooLargeError();
  }

  const { bytes, truncated } = await readLimitedBody(response, maxImageBytes);
  if (truncated) throw new TooLargeError();
  if (bytes.length === 0) return { status: "unavailable" };

  const type = sniffImageType(bytes);
  if (!type) return { status: "unsupported" };

  return { status: "ok", bytes, extension: type, url: url.href };
}

export async function POST(request: NextRequest) {
  let website: unknown;
  try {
    const body: unknown = await request.json();
    website =
      body && typeof body === "object"
        ? (body as { website?: unknown }).website
        : undefined;
  } catch {
    website = undefined;
  }

  if (typeof website !== "string" || !website.trim()) {
    return NextResponse.json(
      { error: "Informe o site da empresa." },
      { status: 400 },
    );
  }

  const target = toPublicTarget(website);
  if (!target) {
    return NextResponse.json({ error: invalidSiteMessage }, { status: 400 });
  }

  try {
    const deadline = startDeadline(totalTimeoutMs);
    const page = await fetchPage(target, deadline);
    const candidates = extractIconUrls(page.html, page.url.href).slice(
      0,
      maxCandidates,
    );

    let tooLarge = false;
    let unsupported = false;

    for (const candidate of candidates) {
      let image: ImageCandidate;
      try {
        image = await downloadCandidate(candidate, deadline);
      } catch (error) {
        // Sem tempo hábil para os próximos candidatos: responde 502 no catch externo.
        if (error instanceof DeadlineExceededError) throw error;
        if (error instanceof TooLargeError) {
          tooLarge = true;
          continue;
        }
        // Candidato bloqueado, inválido ou inacessível: tenta o próximo.
        continue;
      }

      if (image.status === "unsupported") {
        unsupported = true;
        continue;
      }
      if (image.status === "unavailable") continue;

      try {
        const logoPath = await saveLogo(image.bytes, image.extension);
        return NextResponse.json({
          logo_path: logoPath,
          source_url: image.url,
        });
      } catch (error) {
        console.error("Failed to fetch site logo", error);
        return NextResponse.json({ error: saveErrorMessage }, { status: 500 });
      }
    }

    if (tooLarge) {
      return NextResponse.json({ error: tooLargeMessage }, { status: 413 });
    }

    if (unsupported) {
      return NextResponse.json(
        { error: unsupportedFormatMessage },
        { status: 415 },
      );
    }

    return NextResponse.json({ error: notFoundMessage }, { status: 404 });
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

    console.error("Failed to fetch site logo", error);
    return NextResponse.json({ error: unreachableMessage }, { status: 502 });
  }
}
