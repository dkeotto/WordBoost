import React from "react";
import "./StartupScreen.css";

/**
 * İlk açılışta kelimeler yüklenirken gösterilen tam ekran splash.
 * exiting=true olduğunda yumuşak fade-out ile ana uygulamaya geçilir.
 */
export default function StartupScreen({ exiting = false }) {
  return (
    <div className={`startup-root ${exiting ? "startup-root--exit" : ""}`} aria-hidden="true">
      <div className="startup-bg" />
      <div className="startup-orb startup-orb--1" />
      <div className="startup-orb startup-orb--2" />
      <div className="startup-orb startup-orb--3" />

      <div className="startup-content">
        <div className="startup-mark">
          <span className="startup-mark__ring" />
          <span className="startup-mark__icon" aria-hidden>
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M14 34V14l10 10 10-10v20"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <h1 className="startup-title">
          <span className="startup-title__main">YDT</span>
          <span className="startup-title__sub">Kelime Pratiği</span>
        </h1>

        <p className="startup-tagline">İngilizce kelime hazneni güçlendir</p>

        <div className="startup-progress" role="progressbar" aria-label="Hazırlanıyor">
          <div className="startup-progress__track">
            <div className="startup-progress__fill" />
          </div>
        </div>

        <p className="startup-hint">Hazırlanıyor</p>
      </div>

      <div className="startup-grain" />
    </div>
  );
}
