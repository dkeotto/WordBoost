import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

{currentView === 'favorites' && <FavoritesView />}

createRoot(document.getElementById('root')).render(
  <App />,
)
