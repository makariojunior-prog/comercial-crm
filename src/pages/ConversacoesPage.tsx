import { MessageSquare } from 'lucide-react'
import AutomacaoTab from './AutomacaoTab'

export default function ConversacoesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <MessageSquare size={20} className="text-orange-500" />
          Automações
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Envio automático de mensagens — Whatsapp</p>
      </div>
      <AutomacaoTab />
    </div>
  )
}
