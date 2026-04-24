import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'



console.log("WordBoost: main.jsx initializing...");
const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error("WordBoost: CRITICAL - #root element not found!");
} else {
  console.log("WordBoost: Found #root, mounting App...");
  try {
    console.log("WordBoost: Attempting to create root and render App...");
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    console.log("WordBoost: Render call completed successfully.");
  } catch (error) {
    console.error("WordBoost: CRITICAL - Render failed:", error);
  }
}
