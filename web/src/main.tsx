import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { ApprovePage } from './features/approve/ApprovePage'
import { DemoPage } from './features/demo/DemoPage'
import { HomePage } from './features/home/HomePage'
import { PayPage } from './features/pay/PayPage'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/approve/:id" element={<ApprovePage />} />
        <Route path="/pay/:id" element={<PayPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
