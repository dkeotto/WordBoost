import React from "react";
import { PrivacyLegalBody } from "./LegalBodies";
import "./LegalPages.css";

export default function PrivacyPage({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Uygulamaya dön
      </button>

      <PrivacyLegalBody />

      <footer className="legal-footer">
        <a href="/pricing">Fiyatlandırma</a>
        <span aria-hidden> · </span>
        <a href="/terms">Kullanım şartları</a>
      </footer>
    </div>
  );
}
