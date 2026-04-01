import React, { useState } from "react";
import "./StartupScreen.css";

/**
 * İlk açılışta kelimeler yüklenirken gösterilen tam ekran splash.
 * exiting=true olduğunda yumuşak fade-out ile ana uygulamaya geçilir.
 */
export default function StartupScreen({ exiting = false }) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className={`startup-root ${exiting ? "startup-root--exit" : ""}`} aria-hidden="true">
      <div className="startup-bg" />
      <div className="startup-orb startup-orb--1" />
      <div className="startup-orb startup-orb--2" />
      <div className="startup-orb startup-orb--3" />

      <div className="startup-content">
        <div className="startup-brand">
          <div className="startup-logo-wrap">
            {!logoFailed ? (
              <img
                src="/wb-logo.png"
                alt=""
                className="startup-logo"
                width={120}
                height={120}
                decoding="async"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="startup-logo-fallback" aria-hidden>
                WordBoost
              </span>
            )}
          </div>

          <h1 className="startup-title">
            <span className="startup-title__main">WordBoost</span>
            <span className="startup-title__sub">Kelime Pratiği</span>
          </h1>
        </div>

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
