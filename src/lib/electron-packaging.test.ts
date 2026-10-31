import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../../package.json";

const require = createRequire(import.meta.url);
const { standaloneDir } = require("../../electron/resource-paths.cjs") as {
  standaloneDir: (options: {
    app: { isPackaged: boolean };
    dirname?: string;
  }) => string;
};
// Módulo que `electron/database-manager.cjs` carrega com
// `require("../database/sqlite-paths.cjs")`: precisa estar dentro do asar.
const sqlitePaths = require("../../database/sqlite-paths.cjs") as Record<
  string,
  unknown
>;

const repositoryRoot = path.resolve(
  path.dirname(require.resolve("../../electron/resource-paths.cjs")),
  "..",
);
const fromRoot = (relativePath: string) =>
  path.resolve(repositoryRoot, relativePath);

const { build } = packageJson;

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

function currentResourcesPath() {
  const value = (process as { resourcesPath?: string }).resourcesPath;
  if (!value) throw new Error("process.resourcesPath não foi simulado");
  return value;
}

const GLOB_SPECIAL_CHARACTERS = "\\^$.|?+()[]{}";

// Traduz o subconjunto de glob usado pelo electron-builder (`**` atravessa
// diretórios, `*` fica dentro de um segmento) para decidir se um padrão cobre um
// caminho real de arquivo.
function matchesGlob(pattern: string, filePath: string) {
  const normalizedPath = filePath.split(path.sep).join("/");
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        source += "(?:.*/)?";
      } else {
        source += ".*";
      }
      continue;
    }
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    source += GLOB_SPECIAL_CHARACTERS.includes(character)
      ? `\\${character}`
      : character;
  }
  return new RegExp(`^${source}$`).test(normalizedPath);
}

type IconEntry = {
  width: number;
  height: number;
  bitsPerPixel: number;
  bytesInResource: number;
  imageOffset: number;
};

// Lê o ICONDIR (6 bytes) e as ICONDIRENTRY (`<BBBBHHII`) de um arquivo `.ico`.
function parseIconDirectory(buffer: Buffer) {
  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);
  const entries: IconEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = buffer.readUInt8(entryOffset);
    const height = buffer.readUInt8(entryOffset + 1);
    buffer.readUInt8(entryOffset + 2); // cores da paleta
    buffer.readUInt8(entryOffset + 3); // reservado
    buffer.readUInt16LE(entryOffset + 4); // planos
    entries.push({
      // No formato, 0 representa 256 pixels.
      width: width === 0 ? 256 : width,
      height: height === 0 ? 256 : height,
      bitsPerPixel: buffer.readUInt16LE(entryOffset + 6),
      bytesInResource: buffer.readUInt32LE(entryOffset + 8),
      imageOffset: buffer.readUInt32LE(entryOffset + 12),
    });
  }
  return { reserved, type, count, entries };
}

function resourceEntry(to: string) {
  const entry = build.extraResources.find((item) => item.to === to);
  if (!entry) throw new Error(`extraResources não declara o destino ${to}`);
  return entry;
}

// Substitui as macros do electron-builder no nome do artefato publicado.
function resolveArtifactName(artifactName: string) {
  const resolved = artifactName
    .split("${productName}")
    .join(build.productName)
    .split("${version}")
    .join(packageJson.version)
    .split("${ext}")
    .join("exe");
  return resolved;
}

describe("electron-builder: appId", () => {
  it("usa o mesmo identificador de app do processo principal", () => {
    // `electron/main.cjs` chama `app.setAppUserModelId("br.com.crmini.app")`;
    // divergência quebra notificações e agrupamento de janela no Windows.
    expect(build.appId).toBe("br.com.crmini.app");
  });
});

describe("electron-builder: productName e userData", () => {
  it("define productName na raiz, igual ao do build, para nomear o userData", () => {
    // `app.getName()` (que define o `userData` como `%APPDATA%\CRMini`) lê o
    // `productName` da raiz do package.json, não o `build.productName` (que só
    // nomeia exe/atalhos/instalador). Sem a raiz, o pacote cairia no `name`
    // ("crmini") e a pasta de dados viraria `crmini`.
    expect(packageJson.productName).toBe("CRMini");
    expect(packageJson.productName).toBe(build.productName);
  });
});

describe("electron-builder: standalone empacotado", () => {
  it("copia .next/standalone para o diretório que o runtime lê em resources", () => {
    stubResourcesPath(path.join("/opt", "crmini", "resources"));

    const packagedStandaloneDir = standaloneDir({ app: { isPackaged: true } });
    const entry = resourceEntry(path.basename(packagedStandaloneDir));

    expect(entry.from).toBe(".next/standalone");
    // `to` é o nome do diretório dentro de resources, exatamente como
    // `standaloneDir({ app: { isPackaged: true } })` resolve.
    expect(path.basename(packagedStandaloneDir)).toBe(entry.to);
    expect(path.join(currentResourcesPath(), entry.to)).toBe(
      packagedStandaloneDir,
    );
  });

  it("copia o node_modules do standalone em uma entrada própria", () => {
    // O electron-builder não copia `node_modules` quando um diretório inteiro é
    // levado para `resources`: sem a entrada separada, o servidor Next sobe sem
    // dependências no app instalado.
    const modulesEntry = resourceEntry(path.join("app", "node_modules"));

    expect(modulesEntry.from).toBe(".next/standalone/node_modules");
    expect(resourceEntry("app").from).toBe(".next/standalone");
  });
});

describe("electron-builder: ícone da janela", () => {
  it("publica um .ico real em resources/icon.ico com entrada 256x256", () => {
    stubResourcesPath(path.join("/opt", "crmini", "resources"));
    const entry = resourceEntry("icon.ico");

    const iconPath = fromRoot(entry.from);
    expect(fs.statSync(iconPath).isFile()).toBe(true);

    const icon = parseIconDirectory(fs.readFileSync(iconPath));
    expect(icon.reserved).toBe(0);
    expect(icon.type).toBe(1);
    expect(icon.count).toBeGreaterThan(0);
    expect(icon.entries).toHaveLength(icon.count);

    // electron-builder exige um ícone 256x256 para `win.icon`.
    const largest = icon.entries.filter(
      (candidate) => candidate.width === 256 && candidate.height === 256,
    );
    expect(largest).toHaveLength(1);
    expect(
      largest[0].imageOffset + largest[0].bytesInResource,
    ).toBeLessThanOrEqual(fs.statSync(iconPath).size);

    // É exatamente o arquivo que `windowIcon()` abre em
    // `path.join(process.resourcesPath, "icon.ico")` quando empacotado.
    expect(path.join(currentResourcesPath(), "icon.ico")).toBe(
      path.join(currentResourcesPath(), entry.to),
    );
  });

  it("usa o mesmo arquivo como ícone do instalador e do portable", () => {
    expect(fromRoot(resourceEntry("icon.ico").from)).toBe(
      fromRoot(build.win.icon),
    );
  });
});

describe("electron-builder: arquivos empacotados", () => {
  it("inclui os arquivos do Electron e o módulo de caminhos do SQLite", () => {
    expect(build.files).toContain("electron/**/*");
    expect(build.files).toContain("database/sqlite-paths.cjs");

    expect(fs.statSync(fromRoot("electron")).isDirectory()).toBe(true);
    expect(fs.statSync(fromRoot("database/sqlite-paths.cjs")).isFile()).toBe(
      true,
    );
  });

  it("cobre todos os módulos .cjs do diretório electron", () => {
    const electronFiles = fs
      .readdirSync(fromRoot("electron"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".cjs"))
      .map((entry) => path.join("electron", entry.name));

    expect(electronFiles.length).toBeGreaterThan(0);
    for (const relativePath of electronFiles) {
      expect(
        build.files.some((pattern) => matchesGlob(pattern, relativePath)),
      ).toBe(true);
    }
  });

  it("empacota um sqlite-paths.cjs com o contrato usado pelo database-manager", () => {
    for (const name of [
      "CRM_TABLES",
      "defaultDatabasePath",
      "validateDatabase",
      "migrateLegacyDatabase",
      "selectDatabasePath",
      "shouldMigrateLegacy",
    ]) {
      expect(sqlitePaths[name]).toBeDefined();
    }
    expect(
      build.files.some((pattern) =>
        matchesGlob(pattern, "database/sqlite-paths.cjs"),
      ),
    ).toBe(true);
  });
});

describe("electron-builder: módulos nativos", () => {
  it("desempacota o binário .node do better-sqlite3", () => {
    const nativeBinary =
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node";

    expect(
      build.asarUnpack.some((pattern) => matchesGlob(pattern, nativeBinary)),
    ).toBe(true);
  });

  it("não desempacota arquivos JavaScript do processo principal", () => {
    expect(
      build.asarUnpack.some((pattern) =>
        matchesGlob(pattern, "electron/main.cjs"),
      ),
    ).toBe(false);
  });
});

describe("casador de glob do teste", () => {
  it("atravessa diretórios com ** e restringe * a um segmento", () => {
    expect(matchesGlob("**/*.node", "build/Release/x.node")).toBe(true);
    expect(matchesGlob("**/*.node", "x.js")).toBe(false);
    expect(matchesGlob("electron/*.cjs", "electron/main.cjs")).toBe(true);
    expect(matchesGlob("electron/*.cjs", "electron/nested/main.cjs")).toBe(
      false,
    );
    expect(matchesGlob("dist/*.exe", "dist/CRMini-0.1.0-setup.exe")).toBe(true);
    expect(matchesGlob("dist/*.exe", "dist/sub/CRMini-0.1.0-setup.exe")).toBe(
      false,
    );
  });
});

describe("electron-builder: instalador NSIS", () => {
  it("instala por usuário, em um clique, preservando o userData", () => {
    // `userData` guarda o banco escolhido e o preferences.json: apagar no
    // uninstall perderia o caminho do banco do usuário.
    expect(build.nsis.oneClick).toBe(true);
    expect(build.nsis.perMachine).toBe(false);
    expect(build.nsis.deleteAppDataOnUninstall).toBe(false);
  });
});

describe("electron-builder: nomes dos artefatos", () => {
  it("gera dois .exe distintos que o workflow publica a partir de dist/", () => {
    const installerName = resolveArtifactName(build.nsis.artifactName);
    const portableName = resolveArtifactName(build.portable.artifactName);

    for (const name of [installerName, portableName]) {
      expect(name).not.toContain("${");
      expect(name.endsWith(".exe")).toBe(true);
      expect(name).not.toContain("/");
      expect(name).not.toContain("\\");
      // O release.yml publica `dist/*.exe` com fail_on_unmatched_files.
      expect(matchesGlob("dist/*.exe", path.join("dist", name))).toBe(true);
    }

    expect(installerName).not.toBe(portableName);
  });
});

describe("scripts de empacotamento", () => {
  it("gera o standalone antes de chamar o electron-builder", () => {
    for (const script of ["package:win", "package:dir"] as const) {
      const command: string = packageJson.scripts[script];
      expect(command).toBeDefined();

      const buildIndex = command.indexOf("desktop:build");
      const builderIndex = command.indexOf("electron-builder");
      expect(buildIndex).toBeGreaterThanOrEqual(0);
      expect(builderIndex).toBeGreaterThan(buildIndex);
    }

    expect(packageJson.scripts["package:win"]).toContain("--win");
    expect(packageJson.scripts["package:dir"]).toContain("--dir");
    // O `from` de extraResources é produzido por `desktop:build`.
    expect(packageJson.scripts["desktop:build"]).toContain(
      "prepare:standalone",
    );
  });
});

describe("electron-builder: canal de atualização", () => {
  const publish = build.publish as {
    provider: string;
    owner: string;
    repo: string;
    releaseType: string;
  };

  it("publica o feed de atualização no repositório configurado", () => {
    // O `app-update.yml` gerado no pacote aponta para este repositório; ele
    // precisa ser público para o cliente ler `latest.yml` sem token.
    expect(publish).toEqual({
      provider: "github",
      owner: "CRMini",
      repo: "CRMini",
      releaseType: "release",
    });
  });

  it("leva o electron-updater para o pacote como dependência de produção", () => {
    const dependencies = packageJson.dependencies as Record<string, string>;
    const devDependencies = packageJson.devDependencies as Record<
      string,
      string
    >;

    expect(dependencies["electron-updater"]).toMatch(/^\^?6\./);
    expect(devDependencies["electron-updater"]).toBeUndefined();
  });

  describe("workflow de release", () => {
    const workflow = fs.readFileSync(
      fromRoot(".github/workflows/release.yml"),
      "utf8",
    );
    const publishIndex = workflow.indexOf("name: Publicar release");
    const validationIndex = workflow.indexOf(
      "name: Validar metadados de atualização",
    );

    it("valida o metadata de atualização antes de publicar", () => {
      // Publicar um `.exe` sem `latest.yml` deixaria todos os clientes sem
      // atualização, sem erro visível.
      expect(validationIndex).toBeGreaterThan(-1);
      expect(publishIndex).toBeGreaterThan(validationIndex);
    });

    it("gera o pacote sem publicar pelo electron-builder", () => {
      expect(workflow).toContain("--publish never");
    });

    it("anexa os instaladores e o metadata à release", () => {
      const publication = workflow.slice(publishIndex);

      for (const asset of [
        "dist/*.exe",
        "dist/latest.yml",
        "dist/*.blockmap",
      ]) {
        expect(publication).toContain(asset);
      }
      expect(publication).toContain("fail_on_unmatched_files: true");
      expect(publication).toContain("draft: false");
      expect(publication).toContain("prerelease: false");
      // Sem isso a release sai sem descrição e alguém precisa editar à mão.
      expect(publication).toContain("generate_release_notes: true");
    });

    it("mantém o metadata também no artefato do workflow_dispatch", () => {
      const artifactIndex = workflow.indexOf("name: crmini-windows");
      const artifact = workflow.slice(artifactIndex, publishIndex);

      for (const asset of ["dist/latest.yml", "dist/*.blockmap"]) {
        expect(artifact).toContain(asset);
      }
    });

    describe("owner/repo do app-update.yml", () => {
      const artifactIndex = workflow.indexOf(
        "name: Disponibilizar executáveis",
      );
      const validation = workflow.slice(validationIndex, artifactIndex);

      it("compara owner e repo do package.json com o app-update.yml", () => {
        // O electron-builder gera `app-update.yml` a partir de
        // `build.publish`; se os valores divergirem (repositório movido), o
        // release publica mas os clientes procuram o feed no endereço antigo.
        const publish = packageJson.build.publish as {
          owner: string;
          repo: string;
        };

        expect(validation).toContain("build.publish");

        for (const field of ["owner", "repo"] as const) {
          // O padrão é montado em tempo de execução e escapado: um valor fixo
          // no workflow deixaria de acompanhar o `package.json`.
          expect(validation).toContain(`[regex]::Escape($publish.${field})`);
          expect(
            validation
              .split("\n")
              .some((line) => line.includes(`^\\s*${field}:`)),
          ).toBe(true);
          expect(validation).toContain(`$appUpdateYml com ${field} `);
        }

        expect(validation).not.toContain(publish.owner);
        expect(validation).not.toContain(publish.repo);
      });

      it("falha quando build.publish não define owner/repo", () => {
        // Valor vazio não pode virar checagem vazia (regex que aceita tudo).
        for (const field of ["owner", "repo"] as const) {
          expect(validation).toContain(`IsNullOrWhiteSpace($publish.${field})`);
          expect(validation).toContain(
            `build.publish.${field} no package.json`,
          );
        }
      });
    });
  });
});
