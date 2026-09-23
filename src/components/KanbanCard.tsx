import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MoreVertical, MessageCircle, History, Trash2, ArrowRightLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Deal, DealStatus } from '../types'
import { STATUS_ORDER, getResponsaveis } from '../types'
import { TypeBadge, PriorityBadge } from './StatusBadge'

interface CardProps {
  deal: Deal
  onOpenEdit: () => void
  onMove: (status: DealStatus) => void
  onDelete: () => void
  onShowHistory: () => void
}

const STATUS_LABEL: Record<DealStatus, string> = {
  'NOVO': 'Novo',
  'EM ANDAMENTO': 'Em Andamento',
  'SUCESSO': 'Sucesso',
  'DESISTIU': 'Desistiu',
  'CANCELADO': 'Cancelado',
}

export function DealCardContent({ deal, onOpenEdit, onMove, onDelete, onShowHistory, dragging }: CardProps & { dragging?: boolean }) {
  const [showMove, setShowMove] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const startDate = deal.start_date ? format(parseISO(deal.start_date), 'dd/MM/yy', { locale: ptBR }) : '-'
  const lastContact = deal.last_contact_date ? format(parseISO(deal.last_contact_date), 'dd/MM/yy', { locale: ptBR }) : '-'
  const digits = deal.contact_phone?.replace(/\D/g, '') ?? ''
  const waNum = digits.length >= 10 ? (digits.startsWith('55') ? digits : '55' + digits) : null

  return (
    <div
      onClick={onOpenEdit}
      className={`card p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow ${dragging ? 'shadow-lg rotate-1' : ''}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <TypeBadge type={deal.deal_type} />
        <PriorityBadge priority={deal.priority} />
      </div>
      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{deal.client_name}</p>
      {getResponsaveis(deal) && (
        <p className="text-xs text-slate-500">{getResponsaveis(deal)}</p>
      )}
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span>Início: {startDate}</span>
        <span>Contato: {lastContact}</span>
      </div>
      {deal.follow_up && (
        <p className="text-xs text-slate-500 line-clamp-2 italic">"{deal.follow_up}"</p>
      )}

      <div
        className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-700"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {waNum && (
          <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600" title="WhatsApp">
            <MessageCircle size={13} />
          </a>
        )}
        <div className="relative">
          <button onClick={() => setShowMove(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400" title="Mover para...">
            <ArrowRightLeft size={13} />
          </button>
          {showMove && (
            <div className="absolute z-10 mt-1 left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 w-40">
              {STATUS_ORDER.filter(s => s !== deal.status).map(s => (
                <button
                  key={s}
                  onClick={() => { onMove(s); setShowMove(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative ml-auto">
          <button onClick={() => setShowMenu(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400" title="Mais ações">
            <MoreVertical size={13} />
          </button>
          {showMenu && (
            <div className="absolute z-10 mt-1 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1 w-36">
              <button
                onClick={() => { onShowHistory(); setShowMenu(false) }}
                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <History size={12} /> Histórico
              </button>
              <button
                onClick={() => { onDelete(); setShowMenu(false) }}
                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function KanbanCard({ deal, onOpenEdit, onMove, onDelete, onShowHistory }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? 'opacity-40' : ''}>
      <DealCardContent deal={deal} onOpenEdit={onOpenEdit} onMove={onMove} onDelete={onDelete} onShowHistory={onShowHistory} />
    </div>
  )
}
