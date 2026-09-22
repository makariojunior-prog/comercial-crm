import { createBrowserClient } from '@supabase/ssr'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Login único (piloto no Compras, ver cantina-compras#6): em produção
// (comercial.cantinaemcasa.com) a sessão vai num cookie com domain=.cantinaemcasa.com,
// o mesmo usado pelo Portal e pelo Compras — logar em um vale nos outros. Em localhost
// e domínios de preview o cookie fica só do host, como um app comum.
const SHARED_DOMAIN = '.cantinaemcasa.com'
const cookieDomain = window.location.hostname.endsWith('cantinaemcasa.com') ? SHARED_DOMAIN : undefined

export const supabase = createBrowserClient(url, key, {
  cookieOptions: { domain: cookieDomain },
})
