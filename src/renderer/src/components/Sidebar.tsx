import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Sparkles,
  AppWindowMac,
  Trash2,
  FileSearch,
  FolderOpen,
  PackageX,
  Settings
} from 'lucide-react'

export type Page =
  | 'dashboard'
  | 'smart'
  | 'apps'
  | 'junk'
  | 'large'
  | 'explorer'
  | 'leftovers'
  | 'settings'

const ITEMS: { id: Page; icon: React.ComponentType<{ size?: number }>; key: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { id: 'smart', icon: Sparkles, key: 'nav.smartScan' },
  { id: 'apps', icon: AppWindowMac, key: 'nav.applications' },
  { id: 'junk', icon: Trash2, key: 'nav.systemJunk' },
  { id: 'large', icon: FileSearch, key: 'nav.largeFiles' },
  { id: 'explorer', icon: FolderOpen, key: 'nav.explorer' },
  { id: 'leftovers', icon: PackageX, key: 'nav.leftovers' },
  { id: 'settings', icon: Settings, key: 'nav.settings' }
]

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }): React.ReactNode {
  const { t } = useTranslation()
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-panel flex flex-col">
      <div className="drag h-14 shrink-0" />
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2.5">
          <img src="./icon.svg" alt="Cleanish" className="w-9 h-9 drop-shadow-lg" draggable={false} />
          <div>
            <p className="font-bold text-[14px] leading-tight text-gradient">Cleanish</p>
            <p className="text-[10px] text-zinc-500 leading-tight">macOS</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2.5 space-y-0.5">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-sky-500/15 to-indigo-500/15 text-sky-300 border border-sky-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-panel-2 border border-transparent'
              }`}
            >
              <Icon size={16} />
              {t(item.key)}
            </button>
          )
        })}
      </nav>
      <div className="p-4 text-[10px] text-zinc-600 leading-relaxed">
        <p>v{__APP_VERSION__}</p>
      </div>
    </aside>
  )
}
