export interface FilaAtendimentoWorkspace {
  id: string
  label: string
  icon: string
  path: string
  supported: boolean
}

export const FILA_ATENDIMENTO_WORKSPACES: FilaAtendimentoWorkspace[] = [
  { id: 'operacao', label: 'Operacao', icon: 'pending_actions', path: '/admin/fila-atendimento', supported: true },
  { id: 'consultor', label: 'Consultor', icon: 'person', path: '/admin/fila-atendimento/consultor', supported: true },
  { id: 'ranking', label: 'Ranking', icon: 'leaderboard', path: '/admin/fila-atendimento/ranking', supported: true },
  { id: 'dados', label: 'Dados', icon: 'bar_chart', path: '/admin/fila-atendimento/dados', supported: true },
  { id: 'inteligencia', label: 'Inteligencia', icon: 'psychology', path: '/admin/fila-atendimento/inteligencia', supported: true },
  { id: 'relatorios', label: 'Relatorios', icon: 'description', path: '/admin/fila-atendimento/relatorios', supported: true },
  { id: 'campanhas', label: 'Campanhas', icon: 'campaign', path: '/admin/fila-atendimento/campanhas', supported: true },
  { id: 'multiloja', label: 'Multi-loja', icon: 'store', path: '/admin/fila-atendimento/multiloja', supported: true },
  { id: 'usuarios', label: 'Usuarios', icon: 'group', path: '/admin/fila-atendimento/usuarios', supported: true },
  { id: 'configuracoes', label: 'Config', icon: 'tune', path: '/admin/fila-atendimento/configuracoes', supported: true }
]

const workspaceMap = new Map(FILA_ATENDIMENTO_WORKSPACES.map((workspace) => [workspace.id, workspace]))

export function getFilaAtendimentoWorkspace(workspaceId: string) {
  return workspaceMap.get(String(workspaceId || '').trim()) || null
}