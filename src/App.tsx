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
import TasksPage from './pages/TasksPage'
import ClientsPage from './pages/ClientsPage'
import EventsPage from './pages/EventsPage'
import SettingsPage from './pages/SettingsPage'
import RoutesPage from './pages/RoutesPage'
import NotesPage from './pages/NotesPage'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardNegocios />} />
              <Route path="/negocios"  element={<Navigate to="/dashboard" replace />} />
              <Route path="/registro"  element={<RegistroNegocios />} />
              <Route path="/visitas"   element={<DashboardVisitas />} />
              <Route path="/tarefas"   element={<TasksPage />} />
              <Route path="/clientes"  element={<ClientsPage />} />
              <Route path="/rotas"      element={<RoutesPage />} />
              <Route path="/notas"      element={<NotesPage />} />
              <Route path="/promotoria" element={<EventsPage />} />
              <Route path="/tabelas"   element={<TabelasPreco />} />
              <Route path="/briefing"  element={<BriefingBI />} />
              <Route path="/usuarios"  element={<GestaoUsuarios />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
