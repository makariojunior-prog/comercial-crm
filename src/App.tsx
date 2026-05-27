import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { PreferencesProvider } from './contexts/PreferencesContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'

const DashboardNegocios  = lazy(() => import('./pages/DashboardNegocios'))
const RegistroNegocios   = lazy(() => import('./pages/RegistroNegocios'))
const DashboardVisitas   = lazy(() => import('./pages/DashboardVisitas'))
const BriefingBI         = lazy(() => import('./pages/BriefingBI'))
const TabelasPreco       = lazy(() => import('./pages/TabelasPreco'))
const GestaoUsuarios     = lazy(() => import('./pages/GestaoUsuarios'))
const TasksPage          = lazy(() => import('./pages/TasksPage'))
const ClientsPage        = lazy(() => import('./pages/ClientsPage'))
const EventsPage         = lazy(() => import('./pages/EventsPage'))
const SettingsPage       = lazy(() => import('./pages/SettingsPage'))
const RoutesPage         = lazy(() => import('./pages/RoutesPage'))
const NotesPage          = lazy(() => import('./pages/NotesPage'))
const SolicitarAmostras  = lazy(() => import('./pages/SolicitarAmostras'))
const SimularVendas      = lazy(() => import('./pages/SimularVendas'))
const LogisticaPage      = lazy(() => import('./pages/LogisticaPage'))
const VarejoPage         = lazy(() => import('./pages/VarejoPage'))
const ConversacoesPage   = lazy(() => import('./pages/ConversacoesPage'))
const SocialPage         = lazy(() => import('./pages/SocialPage'))
const DashboardAtacado   = lazy(() => import('./pages/DashboardAtacado'))
const ClientesVarejo     = lazy(() => import('./pages/ClientesVarejo'))
const CobrancaPage       = lazy(() => import('./pages/CobrancaPage'))
const ComissaoPage       = lazy(() => import('./pages/ComissaoPage'))
const RevendaPage        = lazy(() => import('./pages/RevendaPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <PreferencesProvider>
      <HashRouter>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{ duration: 4000 }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<PrivateRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"     element={<DashboardNegocios />} />
                <Route path="/negocios"      element={<RegistroNegocios />} />
                <Route path="/registro"      element={<Navigate to="/negocios" replace />} />
                <Route path="/visitas"       element={<DashboardVisitas />} />
                <Route path="/tarefas"       element={<TasksPage />} />
                <Route path="/clientes"      element={<ClientsPage />} />
                <Route path="/rotas"         element={<RoutesPage />} />
                <Route path="/notas"         element={<NotesPage />} />
                <Route path="/promotoria"    element={<EventsPage />} />
                <Route path="/tabelas"       element={<TabelasPreco />} />
                <Route path="/amostras"      element={<SolicitarAmostras />} />
                <Route path="/simulador"     element={<SimularVendas />} />
                <Route path="/briefing"      element={<BriefingBI />} />
                <Route path="/usuarios"      element={<GestaoUsuarios />} />
                <Route path="/configuracoes" element={<SettingsPage />} />
                <Route path="/logistica"     element={<LogisticaPage />} />
                <Route path="/varejo"        element={<VarejoPage />} />
                <Route path="/conversas"     element={<ConversacoesPage />} />
                <Route path="/social"        element={<SocialPage />} />
                <Route path="/atacado"       element={<DashboardAtacado />} />
                <Route path="/clientes-varejo" element={<ClientesVarejo />} />
                <Route path="/cobranca"        element={<CobrancaPage />} />
                <Route path="/comissao"        element={<ComissaoPage />} />
                <Route path="/revenda"         element={<RevendaPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </PreferencesProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}
