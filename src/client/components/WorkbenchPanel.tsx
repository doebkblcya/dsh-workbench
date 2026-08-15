/**
 * The single right-side workbench panel: a Files/Git tab bar at the top with
 * the collapse chevron, and one body below. Both bodies stay mounted (the
 * inactive one is display:none) so the file tree, search, graph split ratio,
 * and branch popover state survive tab switches.
 * @module dsh-workbench/client/components/WorkbenchPanel
 */

import { useState } from 'react'
import type { JSX } from 'react'
import { t } from '../locales.ts'
import type { PanelStores } from '../store.ts'
import { ExplorerPanel } from './ExplorerPanel.tsx'
import { GitPanel } from './GitPanel.tsx'
import { ExpandRightIcon, FilesIcon, GitIcon } from './icons.tsx'
import explorerCss from '../styles/explorer.module.css'
import '../styles/tokens.module.css'

/** The whole workbench panel (Files / Git tabs). */
export function WorkbenchPanel({
  stores,
  onToggleCollapse,
}: {
  stores: PanelStores
  onToggleCollapse: () => void
}): JSX.Element {
  const [tab, setTab] = useState<'files' | 'git'>('files')

  return (
    <div className="aionui-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className={explorerCss.tabBar}>
        <button
          type="button"
          className={tab === 'files' ? explorerCss.tabBtnActive : explorerCss.tabBtn}
          onClick={() => setTab('files')}
          aria-pressed={tab === 'files'}
          aria-label={t('explorer.tabs.files')}
          title={t('explorer.tabs.files')}
        >
          <FilesIcon size={18} />
        </button>
        <button
          type="button"
          className={tab === 'git' ? explorerCss.tabBtnActive : explorerCss.tabBtn}
          onClick={() => setTab('git')}
          aria-pressed={tab === 'git'}
          aria-label={t('git.tab')}
          title={t('git.tab')}
        >
          <GitIcon size={18} />
        </button>
        <button
          type="button"
          className="aionui-collapse-chevron"
          onClick={onToggleCollapse}
          title={t('explorer.collapse')}
          aria-label={t('explorer.collapse')}
        >
          <ExpandRightIcon size={16} />
        </button>
      </div>

      {/* Files body. */}
      <div style={{ display: tab === 'files' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <ExplorerPanel stores={stores} />
      </div>

      {/* Git body. */}
      <div style={{ display: tab === 'git' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <GitPanel stores={stores} />
      </div>
    </div>
  )
}
