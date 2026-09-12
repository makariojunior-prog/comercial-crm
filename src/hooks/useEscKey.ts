import { useEffect, useRef } from 'react'

// Pilha de handlers: com modais aninhados (ex.: alocar comodato dentro do
// cadastro do cliente), o ESC deve fechar só o modal do topo — antes,
// todos os listeners disparavam e o modal de baixo fechava junto.
const stack: Array<{ current: () => void }> = []

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  const top = stack[stack.length - 1]
  if (top) top.current()
}

export function useEscKey(onEsc: () => void) {
  const ref = useRef(onEsc)
  ref.current = onEsc

  useEffect(() => {
    if (stack.length === 0) document.addEventListener('keydown', onKeyDown)
    stack.push(ref)
    return () => {
      const i = stack.lastIndexOf(ref)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
