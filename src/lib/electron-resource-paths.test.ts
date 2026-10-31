import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { standaloneDir, dataDir, databaseDir, brandAssetPath } =
  require("../../electron/resource-paths.cjs") as {
    standaloneDir: (options: {
      app?: { isPackaged?: boolean };
      isDevelopment?: boolean;
      dirname?: string;
    }) => string;
    dataDir: (app: { getPath: (name: string) => string }) => string;
    databaseDir: (resourcesDir: string) => string;
    brandAssetPath: (resourcesDir: string, filename: string) => string;
  };

const originalResourcesPath = Object.getOwnPropertyDescriptor(
  process,
  "resourcesPath",
);

afterEach(() => {
  if (originalResourcesPath) {
    Object.defineProperty(process, "resourcesPath", originalResourcesPath);
  } else {
    delete (process as { resourcesPath?: string }).resourcesPath;
  }
});

function stubResourcesPath(value: string) {
  Object.defineProperty(process, "resourcesPath", {
    value,
    writable: true,
    configurable: true,
  });
}

describe("standaloneDir", () => {
  it("resolve para resources/app quando empacotado", () => {
    stubResourcesPath("/opt/crmini/resources");
    expect(
      standaloneDir({ app: { isPackaged: true }, dirname: "/repo/electron" }),
    ).toBe(path.join("/opt/crmini/resources", "app"));
  });

  it("resolve para a raiz do repositório em desenvolvimento", () => {
    expect(
      standaloneDir({ app: {}, isDevelopment: true, dirname: "/repo/electron" }),
    ).toBe(path.resolve("/repo/electron", ".."));
  });

  it("resolve para o standalone em produção local", () => {
    expect(
      standaloneDir({ app: {}, isDevelopment: false, dirname: "/repo/electron" }),
    ).toBe(path.resolve("/repo/electron", "../.next/standalone"));
  });
});

describe("dataDir", () => {
  it("usa o userData do Electron", () => {
    const app = { getPath: (name: string) => `/appdata/${name}` };
    expect(dataDir(app)).toBe("/appdata/userData");
  });
});

describe("databaseDir", () => {
  it("aponta para a subpasta database do diretório de recursos", () => {
    expect(databaseDir("/opt/crmini/resources/app")).toBe(
      path.join("/opt/crmini/resources/app", "database"),
    );
  });
});

describe("brandAssetPath", () => {
  it("resolve o logo sob public/brand no diretório servido/empacotado", () => {
    expect(brandAssetPath("/app/resources/app", "crmini-horizontal-light.svg")).toBe(
      path.join("/app/resources/app", "public", "brand", "crmini-horizontal-light.svg"),
    );
  });
});
