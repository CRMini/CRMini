"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Breadcrumbs from "@/components/breadcrumbs";
import EmptyState from "@/components/empty-state";
import LinkedInCompanyEditor, {
  type CompanyDraft,
} from "@/components/linkedin-company-editor";
import { formatBrazilDate } from "@/lib/brazil-date";
import { matchesSearch } from "@/lib/search-match";
import {
  LINKEDIN_CSV_LIMITS,
  parseLinkedInConnectionsCsv,
  normalizeCompanyKey,
  normalizeEmailKey,
  normalizeLinkedInProfileUrl,
  isLinkedInConnectionImportable,
  type LinkedInParseResult,
} from "@/lib/linkedin-connections";
import {
  clearLinkedInImportDraft,
  readLinkedInImportDraft,
  writeLinkedInImportDraft,
  type LinkedInImportDraft,
} from "@/lib/linkedin-import-draft";

const IMPORT_RETURN_TO = "/contatos/importar";

function contactDetailHref(id: string): string {
  return `/contatos/${id}?returnTo=${encodeURIComponent(IMPORT_RETURN_TO)}`;
}

type Client = {
  id: string;
  company_name: string;
  trade_name?: string;
  is_active: boolean;
};
type Contact = {
  id: string;
  client_id: string;
  company_name: string;
  email?: string;
  linkedin_url?: string;
  is_active: boolean;
};
type ImportResult = {
  counts: { imported: number; skipped: number };
  items: {
    rowId: number;
    status: string;
    contactId?: string;
    existingContactId?: string;
  }[];
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error || "Não foi possível concluir a operação. Tente novamente.",
    );
  return body;
}
function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
function readFile(file: File): Promise<string> {
  if (file.text) return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file);
  });
}

export default function LinkedInImportView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [warning, setWarning] = useState("");
  const [parsed, setParsed] = useState<LinkedInParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(0);
  const [company, setCompany] = useState<
    (CompanyDraft & { rowId: number }) | null
  >(null);
  const [companyError, setCompanyError] = useState("");
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [processed, setProcessed] = useState<Set<number>>(new Set());
  const [importedContacts, setImportedContacts] = useState<
    Record<string, string>
  >({});
  const [draftWarning, setDraftWarning] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const companyCard = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const restoreScroll = useRef<number | null>(null);
  const draftRef = useRef<LinkedInImportDraft | null>(null);
  const draftWarningShown = useRef(false);

  useEffect(() => {
    let active = true;
    const draft = readLinkedInImportDraft();
    if (draft) {
      setParsed(draft.parsed);
      setFileName(draft.fileName);
      setSelected(new Set(draft.selected));
      setAssignments(draft.assignments);
      setQuery(draft.query);
      setOnlySelected(draft.onlySelected);
      setOnlyMissing(draft.onlyMissing);
      setPage(draft.page);
      setProcessed(new Set(draft.processed));
      setImportedContacts(draft.importedContacts);
      setResult(draft.result);
      restoreScroll.current = draft.scrollY;
    }
    Promise.allSettled([
      request<Client[]>("/api/clients?compact=1&include_inactive=1"),
      request<Contact[]>("/api/contacts?include_inactive=1"),
    ]).then(([clientResult, contactResult]) => {
      if (!active) return;
      if (clientResult.status === "fulfilled") setClients(clientResult.value);
      else
        setLoadError(
          "Não foi possível carregar os clientes. Recarregue a página para tentar novamente.",
        );
      if (contactResult.status === "fulfilled")
        setContacts(contactResult.value);
      else
        setWarning(
          "Não foi possível verificar os contatos. A verificação será feita ao importar.",
        );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const companyOpen = company !== null;
  useEffect(() => {
    if (companyOpen) companyCard.current?.focus();
    else if (returnFocus.current) {
      if (returnFocus.current.isConnected) returnFocus.current.focus();
      else fileInput.current?.focus();
      returnFocus.current = null;
    }
  }, [companyOpen]);

  const activeClients = useMemo(
    () => clients.filter((c) => c.is_active),
    [clients],
  );
  const companyIndex = useMemo(() => {
    const index = new Map<string, Client[]>();
    clients.forEach((c) => {
      const key = normalizeCompanyKey(c.company_name);
      index.set(key, [...(index.get(key) || []), c]);
    });
    return index;
  }, [clients]);
  const contactIndex = useMemo(() => {
    const urls = new Map<string, Contact[]>();
    const emails = new Map<string, Contact[]>();
    contacts.forEach((c) => {
      const url = normalizeLinkedInProfileUrl(c.linkedin_url);
      const email = normalizeEmailKey(c.email);
      if (url) urls.set(url, [...(urls.get(url) || []), c]);
      if (email) {
        const key = `${c.client_id}:${email}`;
        emails.set(key, [...(emails.get(key) || []), c]);
      }
    });
    return { urls, emails };
  }, [contacts]);
  const rows = useMemo(
    () =>
      (parsed?.connections || []).map((connection) => {
        const matches =
          companyIndex.get(normalizeCompanyKey(connection.company)) || [];
        const active = matches.filter((c) => c.is_active);
        const client =
          activeClients.find((c) => c.id === assignments[connection.rowId]) ||
          (active.length === 1 ? active[0] : undefined);
        const url = normalizeLinkedInProfileUrl(connection.linkedinUrl);
        const email = normalizeEmailKey(connection.email);
        const existing = [
          ...(url ? contactIndex.urls.get(url) || [] : []),
          ...(email && client
            ? contactIndex.emails.get(`${client.id}:${email}`) || []
            : []),
        ];
        const duplicate = existing.find((c) => c.is_active);
        const reason = processed.has(connection.rowId)
          ? "Conexão já processada"
          : !isLinkedInConnectionImportable(connection)
            ? "Conexão inválida ou repetida no arquivo"
            : !client
              ? "Selecione uma empresa"
              : duplicate
                ? "Contato já cadastrado"
                : "";
        return {
          connection,
          client,
          active,
          inactiveCompany: matches.some((c) => !c.is_active),
          duplicate,
          inactiveContact: existing.some((c) => !c.is_active),
          reason,
        };
      }),
    [parsed, companyIndex, activeClients, assignments, contactIndex, processed],
  );
  const filtered = rows.filter(
    (row) =>
      (!onlySelected || selected.has(row.connection.rowId)) &&
      (!onlyMissing ||
        (!row.client && !row.active.length && !row.inactiveCompany)) &&
      matchesSearch(
        [
          row.connection.fullName,
          row.connection.company,
          row.connection.jobTitle,
          row.connection.email,
        ].join(" "),
        query,
      ),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 50) - 1),
  );
  const visible = filtered.slice(currentPage * 50, currentPage * 50 + 50);

  useEffect(() => {
    if (loading || !parsed || restoreScroll.current === null) return;
    const top = restoreScroll.current;
    restoreScroll.current = null;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, top);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, parsed]);

  useEffect(() => {
    if (!parsed) {
      draftRef.current = null;
      return;
    }
    draftRef.current = {
      savedAt: Date.now(),
      fileName,
      parsed,
      selected: [...selected],
      assignments,
      query,
      onlySelected,
      onlyMissing,
      page: currentPage,
      scrollY: typeof window === "undefined" ? 0 : window.scrollY,
      processed: [...processed],
      importedContacts,
      result,
    };
    const timer = window.setTimeout(() => {
      const snapshot = draftRef.current;
      if (!snapshot) return;
      const saved = writeLinkedInImportDraft({
        ...snapshot,
        savedAt: Date.now(),
        scrollY: window.scrollY,
      });
      if (!saved && !draftWarningShown.current) {
        draftWarningShown.current = true;
        setDraftWarning(
          "Não foi possível salvar o progresso desta importação. Não saia desta tela antes de concluir.",
        );
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    parsed,
    fileName,
    selected,
    assignments,
    query,
    onlySelected,
    onlyMissing,
    currentPage,
    processed,
    importedContacts,
    result,
  ]);

  useEffect(() => {
    const save = () => {
      const snapshot = draftRef.current;
      if (!snapshot) return;
      writeLinkedInImportDraft({
        ...snapshot,
        savedAt: Date.now(),
        scrollY: typeof window === "undefined" ? 0 : window.scrollY,
      });
    };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (draftRef.current) draftRef.current.scrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      const snapshot = draftRef.current;
      if (snapshot) {
        writeLinkedInImportDraft({
          ...snapshot,
          savedAt: Date.now(),
          scrollY: window.scrollY,
        });
      }
    };
  }, []);

  function persistDraft() {
    const snapshot = draftRef.current;
    if (!snapshot) return;
    writeLinkedInImportDraft({
      ...snapshot,
      savedAt: Date.now(),
      scrollY: typeof window === "undefined" ? 0 : window.scrollY,
    });
  }

  function clearFilters() {
    setQuery("");
    setOnlySelected(false);
    setOnlyMissing(false);
    setPage(0);
  }
  function reset() {
    setParsed(null);
    setFileName("");
    setSelected(new Set());
    setAssignments({});
    clearFilters();
    setCompany(null);
    setCompanyError("");
    setNameError("");
    setError("");
    setFileError("");
    setResult(null);
    setProcessed(new Set());
    setImportedContacts({});
    setDraftWarning("");
    draftWarningShown.current = false;
    draftRef.current = null;
    clearLinkedInImportDraft();
  }
  async function upload(file?: File) {
    if (!file) return;
    reset();
    setFileName(file.name);
    setReading(true);
    try {
      if (file.size > LINKEDIN_CSV_LIMITS.maxBytes)
        throw new Error("Arquivo muito grande. O limite é 5 MB.");
      setParsed(parseLinkedInConnectionsCsv(await readFile(file)));
    } catch (reason) {
      setFileError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível ler o arquivo.",
      );
    } finally {
      setReading(false);
    }
  }
  function closeCompany() {
    setCompany(null);
    setCompanyError("");
    setNameError("");
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
    else fileInput.current?.focus();
  }
  function assignCompany(clientId: string) {
    setAssignments((current) => {
      const next = { ...current };
      parsed?.connections.forEach((row) => {
        if (
          normalizeCompanyKey(row.company) ===
          normalizeCompanyKey(company?.original)
        )
          next[row.rowId] = clientId;
      });
      return next;
    });
    closeCompany();
  }
  const suggestions = company
    ? activeClients.filter(
        (c) =>
          normalizeCompanyKey(c.company_name) ===
          normalizeCompanyKey(company.name),
      )
    : [];
  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    if (!company.name.trim()) {
      setNameError("Informe o nome da empresa.");
      return;
    }
    if (suggestions.length) return;
    setSaving(true);
    setCompanyError("");
    setNameError("");
    try {
      const client = await request<Client>(
        "/api/clients",
        post({
          company_name: company.name.trim(),
          industry: company.industry,
          website: company.website.trim(),
        }),
      );
      setClients((current) => [...current, client]);
      assignCompany(client.id);
    } catch (reason) {
      setCompanyError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cadastrar a empresa.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function importContacts() {
    const chosen = rows.filter((row) => selected.has(row.connection.rowId));
    if (chosen.some((row) => !row.client)) {
      setError("Vincule todas as conexões selecionadas a uma empresa.");
      return;
    }
    if (chosen.some((row) => row.reason)) {
      setError(
        "Revise as conexões selecionadas: há contatos inválidos ou já cadastrados.",
      );
      return;
    }
    setImporting(true);
    setError("");
    setResult(null);
    const totals = { imported: 0, skipped: 0 };
    try {
      for (let start = 0; start < chosen.length; start += 1000) {
        const items = chosen
          .slice(start, start + 1000)
          .map(({ connection, client }) => ({
            rowId: connection.rowId,
            clientId: client!.id,
            fullName: connection.fullName,
            jobTitle: connection.jobTitle,
            email: connection.email,
            linkedinUrl: connection.linkedinUrl,
          }));
        const response = await request<ImportResult>(
          "/api/contacts/import",
          post({ dryRun: false, items }),
        );
        totals.imported += response.counts.imported;
        totals.skipped += response.counts.skipped;
        const imported = response.items.filter(
          (item) => item.status === "imported" && item.contactId,
        );
        if (imported.length) {
          setImportedContacts((current) => {
            const next = { ...current };
            for (const item of imported)
              next[String(item.rowId)] = item.contactId!;
            return next;
          });
        }
        const completed = response.items
          .filter((item) =>
            ["imported", "duplicate", "duplicate_in_batch"].includes(
              item.status,
            ),
          )
          .map((item) => item.rowId);
        setProcessed((current) => new Set([...current, ...completed]));
        setSelected(
          (current) =>
            new Set([...current].filter((id) => !completed.includes(id))),
        );
        setResult({ ...totals });
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível importar os contatos.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="records-page linkedin-import" aria-busy={importing}>
      <Breadcrumbs
        items={[
          { label: "Meu espaço", href: "/" },
          { label: "Contatos", href: "/contatos" },
          { label: "Importar do LinkedIn" },
        ]}
      />
      <header className="records-header">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>Importar do LinkedIn</h1>
          <p className="subheading">
            Selecione suas conexões e vincule cada pessoa a uma empresa.
          </p>
        </div>
        <Link className="text-link" href="/contatos">
          ← Voltar aos contatos
        </Link>
      </header>
      <div className={`form-field${fileError ? " has-error" : ""}`}>
        <label className="upload-button" htmlFor="linkedin-file">
          Selecionar arquivo CSV
          <input
            ref={fileInput}
            id="linkedin-file"
            type="file"
            accept=".csv,text/csv"
            disabled={reading || importing || saving || loading}
            aria-invalid={!!fileError}
            aria-describedby={fileError ? "linkedin-file-error" : undefined}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void upload(file);
            }}
          />
        </label>
        <small>{fileName || "Nenhum arquivo selecionado"}</small>
        {parsed && (
          <small>
            O progresso fica salvo nesta aba até você descartar o arquivo.
          </small>
        )}
        {fileError && (
          <span
            id="linkedin-file-error"
            className="form-field-error"
            role="alert"
          >
            {fileError}
          </span>
        )}
      </div>
      {(loading || reading) && (
        <p role="status">
          {reading ? "Lendo arquivo..." : "Carregando clientes e contatos..."}
        </p>
      )}
      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {warning && <p role="status">{warning}</p>}
      {draftWarning && (
        <p className="form-error" role="alert">
          {draftWarning}
        </p>
      )}
      {!parsed && !reading && !loading && !fileError && (
        <EmptyState
          icon={<span aria-hidden="true">in</span>}
          title="Selecione suas conexões"
          description="Envie o Connections.csv exportado pelo LinkedIn. Nenhum contato será selecionado automaticamente."
        />
      )}
      {parsed && (
        <>
          <div className="contact-filters">
            <label>
              <span>Buscar conexões</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="contact-filter-toggle">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(event) => {
                  setOnlySelected(event.target.checked);
                  setPage(0);
                }}
              />
              <span>Somente selecionadas</span>
            </label>
            <label className="contact-filter-toggle">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(event) => {
                  setOnlyMissing(event.target.checked);
                  setPage(0);
                }}
              />
              <span>Somente empresas não cadastradas</span>
            </label>
            <span className="contact-count" aria-live="polite">
              {parsed.rowsRead} lidas · {selected.size} selecionadas ·{" "}
              {parsed.invalidCount} inválidas
            </span>
          </div>
          {!filtered.length ? (
            <EmptyState
              icon={<span aria-hidden="true">⌕</span>}
              title="Nenhuma conexão encontrada"
              description="Experimente ajustar os filtros."
              action={
                <button className="filter-button" onClick={clearFilters}>
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <div
              className="linkedin-import-table"
              role="table"
              aria-label="Conexões do LinkedIn"
            >
              <div className="linkedin-import-table-header" role="row">
                {[
                  "Seleção",
                  "Nome / cargo",
                  "Empresa",
                  "Conectado em",
                  "E-mail",
                  "LinkedIn",
                ].map((label) => (
                  <span role="columnheader" key={label}>
                    {label}
                  </span>
                ))}
              </div>
              {visible.map(
                ({
                  connection: row,
                  client,
                  active,
                  inactiveCompany,
                  duplicate,
                  inactiveContact,
                  reason,
                }) => (
                  <Fragment key={row.rowId}>
                    <div
                      className={`linkedin-import-table-row${company?.rowId === row.rowId ? " editing" : ""}`}
                      role="row"
                    >
                      <div role="cell" data-label="Seleção">
                        <input
                          type="checkbox"
                          checked={selected.has(row.rowId)}
                          disabled={!!reason || importing || saving}
                          title={reason || `Selecionar ${row.fullName}`}
                          aria-label={`Selecionar ${row.fullName || `linha ${row.rowId}`}${reason ? `: ${reason}` : ""}`}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(row.rowId);
                              else next.delete(row.rowId);
                              return next;
                            })
                          }
                        />
                      </div>
                      <div role="cell" data-label="Nome / cargo">
                        <b>{row.fullName || "Nome não informado"}</b>
                        <small>{row.jobTitle || "—"}</small>
                        {row.issues.map((issue) => (
                          <small key={issue.code}>{issue.message}</small>
                        ))}
                        {duplicate && (
                          <Link
                            className="linkedin-import-badge"
                            href={contactDetailHref(duplicate.id)}
                            onClick={persistDraft}
                          >
                            Já cadastrada em {duplicate.company_name}
                          </Link>
                        )}
                        {inactiveContact && (
                          <small>
                            Existe contato desativado com este perfil
                          </small>
                        )}
                        {processed.has(row.rowId) && (
                          <span className="linkedin-import-badge">
                            Conexão processada
                          </span>
                        )}
                        {importedContacts[row.rowId] && (
                          <Link
                            className="text-link"
                            href={contactDetailHref(
                              importedContacts[row.rowId] || "",
                            )}
                            onClick={persistDraft}
                          >
                            Ver contato →
                          </Link>
                        )}
                      </div>
                      <div role="cell" data-label="Empresa">
                        <b>{row.company || "Empresa não informada"}</b>
                        {client && <small>{client.company_name}</small>}
                        {(!row.company ||
                          active.length > 1 ||
                          (active.length === 0 && inactiveCompany)) && (
                          <select
                            className="linkedin-import-client"
                            aria-label={`Empresa de ${row.fullName}`}
                            value={client?.id || ""}
                            disabled={
                              importing || saving || processed.has(row.rowId)
                            }
                            onChange={(event) => {
                              setAssignments((current) => ({
                                ...current,
                                [row.rowId]: event.target.value,
                              }));
                              setSelected((current) => {
                                const next = new Set(current);
                                next.delete(row.rowId);
                                return next;
                              });
                            }}
                          >
                            <option value="">Selecione uma empresa</option>
                            {(row.company && active.length > 1
                              ? active
                              : activeClients
                            ).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.company_name}
                              </option>
                            ))}
                          </select>
                        )}
                        {row.company &&
                          !client &&
                          !active.length &&
                          (inactiveCompany ? (
                            <span className="linkedin-import-badge">
                              Cliente desativado
                            </span>
                          ) : (
                            <>
                              <span className="linkedin-import-badge">
                                Empresa não cadastrada
                              </span>
                              <button
                                type="button"
                                className="filter-button"
                                disabled={importing || saving}
                                aria-expanded={company?.rowId === row.rowId}
                                aria-controls={
                                  company?.rowId === row.rowId
                                    ? `linkedin-company-editor-${row.rowId}`
                                    : undefined
                                }
                                onClick={(event) => {
                                  if (company?.rowId === row.rowId) {
                                    closeCompany();
                                    return;
                                  }
                                  returnFocus.current = event.currentTarget;
                                  setCompany({
                                    rowId: row.rowId,
                                    original: row.company,
                                    name: row.company,
                                    industry: "",
                                    website: "",
                                  });
                                  setCompanyError("");
                                  setNameError("");
                                }}
                              >
                                {company?.rowId === row.rowId
                                  ? "Fechar cadastro"
                                  : "Cadastrar empresa"}
                              </button>
                            </>
                          ))}
                      </div>
                      <div role="cell" data-label="Conectado em">
                        {formatBrazilDate(row.connectedOn)}
                      </div>
                      <div role="cell" data-label="E-mail">
                        {row.email || "—"}
                      </div>
                      <div role="cell" data-label="LinkedIn">
                        {row.linkedinUrl ? (
                          <a
                            className="linkedin-link"
                            href={row.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`LinkedIn de ${row.fullName}`}
                          >
                            in
                          </a>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                    {company && company.rowId === row.rowId && (
                      <div
                        className="linkedin-import-company-editor"
                        role="row"
                        id={`linkedin-company-editor-${row.rowId}`}
                      >
                        <div role="cell" aria-colspan={6}>
                          <LinkedInCompanyEditor
                            contactName={row.fullName || `linha ${row.rowId}`}
                            company={company}
                            suggestions={suggestions}
                            saving={saving}
                            nameError={nameError}
                            companyError={companyError}
                            cardRef={companyCard}
                            onChange={(patch) =>
                              setCompany((current) =>
                                current ? { ...current, ...patch } : current,
                              )
                            }
                            onSubmit={saveCompany}
                            onCancel={closeCompany}
                            onUseExisting={assignCompany}
                          />
                        </div>
                      </div>
                    )}
                  </Fragment>
                ),
              )}
            </div>
          )}
          {!!filtered.length && (
            <nav
              className="linkedin-import-pagination"
              aria-label="Paginação das conexões"
            >
              <button
                className="filter-button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </button>
              <span>
                {currentPage * 50 + 1}–
                {Math.min((currentPage + 1) * 50, filtered.length)} de{" "}
                {filtered.length}
              </span>
              <button
                className="filter-button"
                disabled={(currentPage + 1) * 50 >= filtered.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
          {result && (
            <section className="form-section" role="status">
              <h2>Resultado da importação</h2>
              <p>
                {result.imported} importados · {result.skipped} ignorados
              </p>
              <Link className="text-link" href="/contatos">
                Ver contatos
              </Link>
            </section>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="filter-button"
              disabled={importing || saving}
              onClick={() => {
                if (
                  selected.size &&
                  !window.confirm("Descartar o arquivo e a seleção?")
                )
                  return;
                reset();
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Descartar arquivo
            </button>
            <button
              className="primary-button"
              disabled={
                !selected.size || importing || saving || loading || !!loadError
              }
              onClick={() => void importContacts()}
            >
              {importing
                ? "Importando..."
                : `Importar ${selected.size} contatos`}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
