import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@meeting-stt/design/fonts.css'
import '@meeting-stt/design/base.css'

import App from './App'
import './app.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
