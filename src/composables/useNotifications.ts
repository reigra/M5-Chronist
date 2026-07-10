import { ref } from 'vue'

export type NotificationType = 'ok' | 'warning' | 'error'

export interface Notification {
  id: number
  type: NotificationType
  message: string
}

const activeNotifications = ref<Notification[]>([])
let nextId = 0

const AUTO_CLOSE: Record<NotificationType, number | null> = {
  ok: 3000,
  warning: 6000,
  error: null,
}

export function useNotifications() {
  function add(type: NotificationType, message: string, timeout?: number | null): number {
    const id = nextId++
    activeNotifications.value.push({ id, type, message })

    const ms = timeout !== undefined ? timeout : AUTO_CLOSE[type]
    if (ms !== null) {
      setTimeout(() => dismiss(id), ms)
    }

    return id
  }

  function dismiss(id: number): void {
    const idx = activeNotifications.value.findIndex(n => n.id === id)
    if (idx !== -1) activeNotifications.value.splice(idx, 1)
  }

  return {
    notifications: activeNotifications,
    ok: (message: string, timeout?: number | null) => add('ok', message, timeout),
    warning: (message: string, timeout?: number | null) => add('warning', message, timeout),
    error: (message: string, timeout?: number | null) => add('error', message, timeout),
    dismiss,
  }
}
