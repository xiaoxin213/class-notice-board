import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ConsolePage from './pages/ConsolePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/console/*" element={<ConsolePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
