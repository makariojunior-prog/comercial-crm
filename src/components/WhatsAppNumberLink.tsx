import { MessageCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { whatsappUrl, whatsappUrlAlternativa, whatsappIdCandidates } from '../lib/format'

interface Props {
  telefone: string
  label: string
  className?: string
  showIcon?: boolean
}

// ID que o WhatsApp realmente usa para o contato, se ele já conversou com a loja pelo Digisac.
async function idConhecido(telefone: string): Promise<string | null> {
  const candidatos = whatsappIdCandidates(telefone)
  if (candidatos.length === 0) return null
  const consulta = supabase
    .from('crm_conversations')
    .select('telefone')
    .in('telefone', candidatos)
    .limit(1)
    .then(({ data }) => (data?.[0]?.telefone as string | undefined) ?? null)
  const limite = new Promise<null>(resolve => setTimeout(() => resolve(null), 1500))
  return Promise.race([consulta, limite]).catch(() => null)
}

function abrirNovaAba(): Window | null {
  const w = window.open('', '_blank')
  if (w) w.opener = null
  return w
}

/**
 * Número clicável que abre a conversa no WhatsApp. Usa o ID exato do Digisac quando o
 * cliente já conversou com a loja; senão, a regra do nono dígito. O botão ao lado abre o
 * outro formato (com/sem o 9) para o caso raro em que a regra erra.
 */
export default function WhatsAppNumberLink({ telefone, label, className = '', showIcon = true }: Props) {
  const url = whatsappUrl(telefone)
  const alt = whatsappUrlAlternativa(telefone)

  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="Número inválido: corrija o telefone na origem">
        {showIcon && <MessageCircle size={11} />} {telefone} · número inválido
      </span>
    )
  }

  async function abrir(e: React.MouseEvent) {
    e.stopPropagation()
    // A aba precisa ser aberta já no clique (senão o navegador bloqueia como pop-up);
    // o endereço é definido depois da consulta.
    const w = abrirNovaAba()
    if (!w) return
    e.preventDefault()
    const id = await idConhecido(telefone)
    w.location.href = id ? `https://wa.me/${id}` : url!
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={abrir}
        className={`inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline ${className}`}
      >
        {showIcon && <MessageCircle size={11} />} {label}
      </a>
      {alt && (
        <a
          href={alt}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Não abriu a conversa? Tentar o outro formato do número (com/sem o 9)"
          className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-green-600 dark:hover:text-green-400"
        >
          <RefreshCw size={10} /> outro formato
        </a>
      )}
    </span>
  )
}
