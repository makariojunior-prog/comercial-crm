import { useEffect, useRef } from 'react'

/**
 * Como setInterval, mas só roda com a aba visível. Aba em segundo plano não tem
 * quem olhe o resultado, e cada tick vira requisições ao Supabase (e linhas de
 * Log Ingestion). Ao voltar para a aba, atualiza na hora se já passou o intervalo.
 *
 * Não executa na montagem — quem usa já carrega os dados por conta própria.
 */
export function useVisibleInterval(fn: () => void, ms: number) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let ultimo = Date.now()

    const rodar = () => { ultimo = Date.now(); fnRef.current() }
    const iniciar = () => { if (timer === null) timer = setInterval(rodar, ms) }
    const parar = () => { if (timer !== null) { clearInterval(timer); timer = null } }

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - ultimo >= ms) rodar()
        iniciar()
      } else {
        parar()
      }
    }

    if (document.visibilityState === 'visible') iniciar()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    return () => {
      parar()
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [ms])
}
