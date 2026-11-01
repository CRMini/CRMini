"use client";

import type { FormEvent, RefObject } from "react";
import { CLIENT_SEGMENTS } from "@/lib/segments";

export type CompanyDraft = {
  original: string;
  name: string;
  industry: string;
  website: string;
};

export type CompanySuggestion = {
  id: string;
  company_name: string;
};

export default function LinkedInCompanyEditor({
  contactName,
  company,
  suggestions,
  saving,
  nameError,
  companyError,
  cardRef,
  onChange,
  onSubmit,
  onCancel,
  onUseExisting,
}: {
  contactName: string;
  company: CompanyDraft;
  suggestions: CompanySuggestion[];
  saving: boolean;
  nameError: string;
  companyError: string;
  cardRef: RefObject<HTMLElement | null>;
  onChange: (patch: Partial<CompanyDraft>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onUseExisting: (clientId: string) => void;
}) {
  return (
    <section
      className="linkedin-company-editor"
      ref={cardRef}
      tabIndex={-1}
      aria-label={`Cadastrar empresa para ${contactName}`}
    >
      <div className="form-section-heading">
        <div>
          <h2>Cadastrar empresa para {contactName}</h2>
          <p>
            O vínculo será aplicado a todas as conexões de{" "}
            <strong>{company.original}</strong> no arquivo.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <label className={`form-field${nameError ? " has-error" : ""}`}>
            <span>Empresa *</span>
            <input
              required
              value={company.name}
              disabled={saving}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "company-name-error" : undefined}
              onChange={(event) => onChange({ name: event.target.value })}
            />
            {nameError && (
              <span
                id="company-name-error"
                className="form-field-error"
                role="alert"
              >
                {nameError}
              </span>
            )}
          </label>
          <label className="form-field">
            <span>Segmento</span>
            <select
              value={company.industry}
              disabled={saving}
              onChange={(event) => onChange({ industry: event.target.value })}
            >
              <option value="">Selecione</option>
              {CLIENT_SEGMENTS.map((segment) => (
                <option key={segment}>{segment}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Site</span>
            <input
              value={company.website}
              disabled={saving}
              onChange={(event) => onChange({ website: event.target.value })}
            />
          </label>
        </div>
        {suggestions.map((client) => (
          <p key={client.id}>
            Já existe uma empresa com este nome: {client.company_name} —{" "}
            <button
              type="button"
              className="filter-button"
              onClick={() => onUseExisting(client.id)}
            >
              usar esta
            </button>
          </p>
        ))}
        {companyError && (
          <p className="form-error" role="alert">
            {companyError}
          </p>
        )}
        <div className="linkedin-import-inline-actions">
          <button
            type="button"
            className="filter-button"
            disabled={saving}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="primary-button"
            disabled={saving || !!suggestions.length}
          >
            {saving ? "Salvando..." : "Cadastrar empresa"}
          </button>
        </div>
      </form>
    </section>
  );
}
