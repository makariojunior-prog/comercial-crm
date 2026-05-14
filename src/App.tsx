import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { PreferencesProvider } from './contexts/PreferencesContext'
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
import SolicitarAmostras from './pages/SolicitarAmostras'
import SimularVendas from './pages/SimularVendas'
import LogisticaPage from './pages/LogisticaPage'

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <PreferencesProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardNegocios />} />
              <Route path="/negocios"  element={<RegistroNegocios />} />
              <Route path="/registro"  element={<Navigate to="/negocios" replace />} />
              <Route path="/visitas"   element={<DashboardVisitas />} />
              <Route path="/tarefas"   element={<TasksPage />} />
              <Route path="/clientes"  element={<ClientsPage />} />
              <Route path="/rotas"      element={<RoutesPage />} />
              <Route path="/notas"      element={<NotesPage />} />
              <Route path="/promotoria" element={<EventsPage />} />
              <Route path="/tabelas"    element={<TabelasPreco />} />
              <Route path="/amostras"  element={<SolicitarAmostras />} />
              <Route path="/simulador" element={<SimularVendas />} />
              <Route path="/briefing"  element={<BriefingBI />} />
              <Route path="/usuarios"  element={<GestaoUsuarios />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
              <Route path="/logistica"    element={<LogisticaPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </PreferencesProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}
