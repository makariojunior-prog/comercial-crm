import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Deal, DealStatus } from '../types'
import { STATUS_ORDER } from '../types'
import KanbanColumn from './KanbanColumn'
import { DealCardContent } from './KanbanCard'

const CLOSED_STATUSES: DealStatus[] = ['SUCESSO', 'DESISTIU', 'CANCELADO']

interface Props {
  deals: Deal[]
  hideClosed: boolean
  onOpenEdit: (deal: Deal) => void
  onMove: (deal: Deal, status: DealStatus) => void
  onDelete: (deal: Deal) => void
  onShowHistory: (deal: Deal) => void
}

export default function KanbanBoard({ deals, hideClosed, onOpenEdit, onMove, onDelete, onShowHistory }: Props) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const byStatus = (status: DealStatus) => deals.filter(d => d.status === status)
  const visibleStatuses = hideClosed
    ? STATUS_ORDER.filter(s => !CLOSED_STATUSES.includes(s))
    : STATUS_ORDER

  function handleDragStart(event: DragStartEvent) {
    setActiveDeal((event.active.data.current as { deal: Deal } | undefined)?.deal ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDeal(null)
    const deal = (event.active.data.current as { deal: Deal } | undefined)?.deal
    const newStatus = event.over?.id as DealStatus | undefined
    if (!deal || !newStatus) return
    onMove(deal, newStatus)
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {visibleStatuses.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            deals={byStatus(status)}
            onOpenEdit={onOpenEdit}
            onMove={onMove}
            onDelete={onDelete}
            onShowHistory={onShowHistory}
          />
        ))}
      </div>
      <DragOverlay>
        {activeDeal ? (
          <DealCardContent
            deal={activeDeal}
            onOpenEdit={() => {}}
            onMove={() => {}}
            onDelete={() => {}}
            onShowHistory={() => {}}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
