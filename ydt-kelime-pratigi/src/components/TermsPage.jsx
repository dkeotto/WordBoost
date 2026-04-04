import React from "react";
import { TermsLegalBody } from "./LegalBodies";
import "./LegalPages.css";

export default function TermsPage({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Uygulamaya dön
      </button>

      <TermsLegalBody />

      <footer className="legal-footer">
        <a href="/pricing">Fiyatlandırma</a>
        <span aria-hidden> · </span>
        <a href="/privacy">Gizlilik</a>
      </footer>
    </div>
  );
}
