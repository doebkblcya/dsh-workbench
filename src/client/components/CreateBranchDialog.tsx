/**
 * The create-branch dialog: name input with the pure validation mirror for
 * instant feedback, the host `check-ref-format` gate as authority, and
 * readable rejection copy. Adapted from dsh-web-ui's CreateBranchDialog
 * (BSD-3-Clause).
 * @module dsh-workbench/client/components/CreateBranchDialog
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX } from 'react'
import { validateBranchName } from '../../core/git-command.ts'
import { t, gitErrorCopy } from '../locales.ts'
import type { PanelStores } from '../store.ts'
import { toast } from './overlay.tsx'
import gitCss from '../styles/git.module.css'

/** The create-and-switch dialog. */
export function CreateBranchDialog({
  stores,
  onClose,
}: {
  stores: PanelStores
  onClose: () => void
}): JSX.Element {
  const git = stores.git
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const submit = async (): Promise<void> => {
    if (pending) return
    const trimmed = name.trim()
    if (validateBranchName(trimmed) !== null) {
      setError(t('git.error.invalidBranchName'))
      return
    }
    setPending(true)
    setError(null)
    const ok = await git.createBranch(trimmed)
    setPending(false)
    if (ok) {
      toast(t('git.toast.createSuccess', { branchName: trimmed }))
      onClose()
      return
    }
    const err = git.getSnapshot().switchError
    setError(err === null ? t('git.error.internal') : gitErrorCopy(err))
  }

  return createPortal(
    <div className="aionui-overlay" onPointerDown={onClose}>
      <div className="aionui-dialog" onPointerDown={(event) => event.stopPropagation()}>
        <div className="aionui-dialog-title">{t('git.branch.createDialog.title')}</div>
        <div className="aionui-dialog-body">
          <p style={{ margin: '0 0 10px' }}>{t('git.branch.createDialog.description')}</p>
          <label className={gitCss.dialogLabel} htmlFor="workbench-branch-name">
            {t('git.branch.createDialog.nameLabel')}
          </label>
          <input
            id="workbench-branch-name"
            className={gitCss.dialogInput}
            value={name}
            onChange={(event) => { setName(event.target.value) }}
            placeholder={t('git.branch.createDialog.placeholder')}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
            autoFocus
          />
          {error !== null && <div className={gitCss.dialogError}>{error}</div>}
        </div>
        <div className="aionui-dialog-actions">
          <button type="button" className="aionui-btn" onClick={onClose}>
            {t('git.branch.createDialog.cancel')}
          </button>
          <button
            type="button"
            className="aionui-btn aionui-btn-primary"
            onClick={() => { void submit() }}
            disabled={pending || name.trim() === ''}
          >
            {t('git.branch.createDialog.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
