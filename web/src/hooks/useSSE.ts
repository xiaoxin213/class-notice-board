import { useEffect, useRef } from 'react'
import { getToken } from '../api'

export type SSEEvent =
  | { type: 'device_status'; classId: number; online: number }
  | { type: 'notice_ack'; noticeId: number; classId: number; deviceId: number; allDelivered: boolean }

export function useSSE(onEvent: (e: SSEEvent) => void, enabled: boolean) {
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent

  useEffect(() => {
    if (!enabled) return
    const token = getToken()
    if (!token) return

    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let delay = 1000

    function connect() {
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
      es.onopen    = () => { delay = 1000 }
      es.onmessage = (ev) => {
        try { cbRef.current(JSON.parse(ev.data) as SSEEvent) } catch {}
      }
      es.onerror = () => {
        es?.close()
        retryTimeout = setTimeout(() => { connect() }, delay)
        delay = Math.min(delay * 2, 30000)
      }
    }
    connect()

    return () => { es?.close(); clearTimeout(retryTimeout) }
  }, [enabled])
}
