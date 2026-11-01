import { describe, expect, it } from "vitest";
import { isBlockedAddress, normalizeHttpUrl, toPublicTarget } from "./safe-url";

describe("normalizeHttpUrl", () => {
  it("mantém URLs http e https completas", () => {
    expect(normalizeHttpUrl("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(normalizeHttpUrl("http://example.com/path?secao=1")).toBe(
      "http://example.com/path?secao=1",
    );
  });

  it("assume https:// quando o site não traz esquema", () => {
    expect(normalizeHttpUrl("example.com")).toBe("https://example.com/");
    expect(normalizeHttpUrl("example.com/contato")).toBe(
      "https://example.com/contato",
    );
  });

  it("remove espaços ao redor do valor", () => {
    expect(normalizeHttpUrl("   example.com   ")).toBe("https://example.com/");
    expect(normalizeHttpUrl("\thttps://example.com\n")).toBe(
      "https://example.com/",
    );
  });

  it.each(["", "   ", "\n\t"])("recusa valor vazio (%j)", (value) => {
    expect(normalizeHttpUrl(value)).toBeNull();
  });

  it("recusa valor que não é texto", () => {
    expect(normalizeHttpUrl(null as unknown as string)).toBeNull();
    expect(normalizeHttpUrl(undefined as unknown as string)).toBeNull();
  });

  it.each([
    "ftp://example.com",
    "file://example.com/logo.png",
    "javascript://example.com",
    "ws://example.com",
  ])("recusa o esquema não http(s) %s", (value) => {
    expect(normalizeHttpUrl(value)).toBeNull();
  });

  it.each(["https://usuario:senha@example.com", "http://usuario@example.com"])(
    "recusa credenciais embutidas (%s)",
    (value) => {
      expect(normalizeHttpUrl(value)).toBeNull();
    },
  );

  it.each(["http://", "https://", "exa mple.com", "https://?consulta=1"])(
    "recusa endereço inválido %j",
    (value) => {
      expect(normalizeHttpUrl(value)).toBeNull();
    },
  );
});

describe("toPublicTarget", () => {
  it("devolve a URL normalizada de um destino público", () => {
    expect(toPublicTarget("example.com/logo")?.href).toBe(
      "https://example.com/logo",
    );
    expect(toPublicTarget("http://example.com:80/")?.href).toBe(
      "http://example.com/",
    );
    expect(toPublicTarget("https://example.com:443/")?.href).toBe(
      "https://example.com/",
    );
  });

  it.each([
    "",
    "ftp://example.com",
    "https://usuario:senha@example.com",
    "http://example.com:8080",
    "exa mple.com",
  ])("recusa destino não consultável %j", (value) => {
    expect(toPublicTarget(value)).toBeNull();
  });
});

describe("isBlockedAddress", () => {
  it.each([
    ["0.0.0.0", "rede 0/8"],
    ["0.1.2.3", "rede 0/8"],
    ["10.0.0.1", "rede privada 10/8"],
    ["10.255.255.255", "rede privada 10/8"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["100.64.0.1", "CGNAT"],
    ["100.127.255.255", "CGNAT"],
    ["169.254.169.254", "link-local / metadados de nuvem"],
    ["172.16.0.1", "rede privada 172.16/12"],
    ["172.31.255.255", "rede privada 172.16/12"],
    ["192.168.0.1", "rede privada 192.168/16"],
    ["192.0.0.9", "192.0.0/24"],
    ["198.18.0.1", "benchmark 198.18/15"],
    ["198.19.255.255", "benchmark 198.18/15"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast/reservado"],
  ])("bloqueia IPv4 interno %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "11.0.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "198.20.0.1",
    "223.255.255.255",
  ])("aceita IPv4 público %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it.each([
    ["::", "endereço não especificado"],
    ["::1", "loopback"],
    ["[::1]", "loopback entre colchetes"],
    ["fc00::1", "ULA fc00::/7"],
    ["fd12:3456:789a::1", "ULA fd00::/8"],
    ["fe80::1", "link-local fe80::/10"],
    ["::ffff:10.0.0.1", "IPv4 mapeado privado"],
    ["::ffff:127.0.0.1", "IPv4 mapeado loopback"],
    ["::ffff:169.254.169.254", "IPv4 mapeado link-local"],
  ])("bloqueia IPv6 interno %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "aceita IPv6 público %s",
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it.each([
    ["::7f00:1", "IPv4-compatível com loopback"],
    ["::10.0.0.1", "IPv4-compatível com rede privada"],
    ["64:ff9b::10.0.0.1", "NAT64 apontando para rede privada"],
    ["64:ff9b::192.168.0.1", "NAT64 apontando para 192.168/16"],
    ["2002:7f00:1::", "6to4 com loopback embutido"],
    ["2002:c0a8:1::", "6to4 com 192.168 embutido"],
  ])("bloqueia IPv6 que carrega IPv4 interno %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    ["64:ff9b::8.8.8.8", "NAT64 com IPv4 público"],
    ["2002:808:808::", "6to4 com IPv4 público"],
  ])("aceita IPv6 que carrega IPv4 público %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it.each(["", "   ", "not-an-ip", "example.com", "192.168.0", "999.1.1.1"])(
    "falha fechada para endereço inválido %j",
    (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    },
  );

  it.each([
    ["1:2:3:4:5:6:7", "sete grupos sem compressão"],
    ["1:2:3:4:5:6:7:8:9", "nove grupos sem compressão"],
  ])("falha fechada para IPv6 malformado %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });
});
