import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardNegocios from './pages/DashboardNegocios'
import RegistroNegocios from './pages/RegistroNegocios'
import DashboardVisitas from './pages/DashboardVisitas'
import BriefingBI from './pages/BriefingBI'
import TabelasPreco from './pages/TabelasPreco'
import GestaoUsuarios from './pages/GestaoUsuarios'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/negocios" replace />} />
              <Route path="/negocios"  element={<DashboardNegocios />} />
              <Route path="/registro"  element={<RegistroNegocios />} />
              <Route path="/visitas"   element={<DashboardVisitas />} />
              <Route path="/tabelas"   element={<TabelasPreco />} />
              <Route path="/briefing"  element={<BriefingBI />} />
              <Route path="/usuarios"  element={<GestaoUsuarios />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
