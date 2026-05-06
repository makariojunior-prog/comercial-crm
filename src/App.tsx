import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardNegocios from './pages/DashboardNegocios'
import RegistroNegocios from './pages/RegistroNegocios'
import DashboardVisitas from './pages/DashboardVisitas'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/negocios" replace />} />
          <Route path="/negocios" element={<DashboardNegocios />} />
          <Route path="/registro" element={<RegistroNegocios />} />
          <Route path="/visitas" element={<DashboardVisitas />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
