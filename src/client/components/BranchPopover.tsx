/**
 * The branch picker popover in the Git column: searchable local branch list
 * with the current branch checked, switch feedback, and the create-branch
 * footer. Adapted from dsh-web-ui's BranchPopover (BSD-3-Clause), re-seated
 * onto the aionui token scheme + the unified git store.
 * @module dsh-workbench/client/components/BranchPopover
 */

import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { t, gitErrorCopy } from '../locales.ts'
import { useStore } from '../hooks/useStore.ts'
import type { PanelStores } from '../store.ts'
import { toast } from './overlay.tsx'
import { BranchIcon, CheckIcon, SearchIcon } from './icons.tsx'
import { cx } from './cx.ts'
import gitCss from '../styles/git.module.css'

/** The branch picker popover. */
export function BranchPopover({
  stores,
  onClose,
  onCreate,
}: {
  stores: PanelStores
  onClose: () => void
  onCreate: () => void
}): JSX.Element {
  const git = stores.git
  const state = useStore(git)
  const [query, setQuery] = useState('')

  const view = state.branches
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (view === null) return []
    if (needle === '') return view.branches
    return view.branches.filter(branch => branch.name.toLowerCase().includes(needle))
  }, [view, query])

  const switchTo = async (branch: string): Promise<void> => {
    if (state.switching) return
    const ok = await git.switchBranch(branch)
    if (ok) {
      toast(t('git.toast.switchSuccess', { branchName: branch }))
      onClose()
    }
  }

  return (
    <>
      <div className={gitCss.backdrop} onClick={onClose} />
      <div className={gitCss.popover} role="listbox" aria-label={t('git.branch.search')}>
        <div className={gitCss.searchBox}>
          <SearchIcon size={14} />
          <input
            className={gitCss.searchInput}
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
            placeholder={t('git.branch.search')}
            autoFocus
          />
        </div>
        {view !== null && view.dirtyFiles > 0 && (
          <div className={gitCss.dirty}>{t('git.branch.dirty', { count: view.dirtyFiles })}</div>
        )}
        <div className={gitCss.branchList}>
          {state.branchesLoading && view === null && (
            <div className={gitCss.branchEmpty}>{t('git.graph.loading')}</div>
          )}
          {view !== null && filtered.length === 0 && (
            <div className={gitCss.branchEmpty}>{t('git.branch.empty')}</div>
          )}
          {filtered.map(branch => (
            <button
              type="button"
              key={branch.name}
              className={cx(gitCss.branchItem, branch.current && gitCss.branchItemActive)}
              onClick={() => { void switchTo(branch.name) }}
              role="option"
              aria-selected={branch.current}
              disabled={state.switching}
            >
              <BranchIcon size={14} />
              <span className={gitCss.branchItemName} title={branch.name}>{branch.name}</span>
              {branch.current && <CheckIcon size={14} className={gitCss.branchCheck} />}
            </button>
          ))}
        </div>
        {state.switchError !== null && <div className={gitCss.notice}>{gitErrorCopy(state.switchError)}</div>}
        <div className={gitCss.popoverFooter}>
          <button type="button" className={gitCss.footerItem} onClick={onCreate}>
            <BranchIcon size={14} />
            {t('git.branch.create')}
          </button>
        </div>
      </div>
    </>
  )
}
