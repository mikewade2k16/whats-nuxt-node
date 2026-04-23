const MATERIAL_ICON_TO_LUCIDE: Record<string, string> = {
  add: 'i-lucide-plus',
  add_circle: 'i-lucide-circle-plus',
  assignment: 'i-lucide-clipboard-list',
  badge: 'i-lucide-badge',
  bar_chart: 'i-lucide-bar-chart-3',
  bolt: 'i-lucide-zap',
  campaign: 'i-lucide-megaphone',
  check: 'i-lucide-check',
  check_small: 'i-lucide-check',
  close: 'i-lucide-x',
  description: 'i-lucide-file-text',
  do_not_disturb_on: 'i-lucide-ban',
  edit_note: 'i-lucide-file-pen-line',
  expand_more: 'i-lucide-chevron-down',
  fact_check: 'i-lucide-list-checks',
  group: 'i-lucide-users',
  hourglass_top: 'i-lucide-hourglass',
  inventory_2: 'i-lucide-package-2',
  leaderboard: 'i-lucide-trophy',
  login: 'i-lucide-log-in',
  note_add: 'i-lucide-notebook-pen',
  notifications_active: 'i-lucide-bell-ring',
  pause: 'i-lucide-pause',
  pending_actions: 'i-lucide-list-todo',
  person: 'i-lucide-user-round',
  play_arrow: 'i-lucide-play',
  psychology: 'i-lucide-brain-circuit',
  query_stats: 'i-lucide-chart-column',
  refresh: 'i-lucide-refresh-cw',
  search: 'i-lucide-search',
  share_location: 'i-lucide-map-pinned',
  speed: 'i-lucide-gauge',
  store: 'i-lucide-store',
  trending_down: 'i-lucide-trending-down',
  tune: 'i-lucide-sliders-horizontal'
}

function normalizeIconToken(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function resolveAppIconName(value: unknown, fallback = 'i-lucide-circle') {
  const normalized = normalizeIconToken(value)
  if (!normalized) {
    return fallback
  }

  if (normalized.startsWith('i-')) {
    return normalized
  }

  return MATERIAL_ICON_TO_LUCIDE[normalized] || fallback
}