/**
 * React bindings for the framework-free stores: useSyncExternalStore with a
 * stable snapshot (the stores return immutable snapshots, so selector-free
 * subscription is safe), plus a stable-callback helper for event handlers.
 * @module dsh-workbench/client/hooks/useStore
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { StateHandle } from '../store.ts'

/** Subscribe a component to one store (full snapshot). */
export function useStore<S>(store: StateHandle<S>): S {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/**
 * Subscribe a component to one derived value of a store, re-rendering only
 * when the selected value changes. The selector result is cached per snapshot
 * object, so it must return primitives or stable references (never a fresh
 * object/array per call) — that is what keeps useSyncExternalStore from
 * looping. Use it for cheap fields (booleans, ids) that change rarely, so a
 * frequently-updated store (e.g. scm status) does not re-render panels that
 * only read one flag.
 */
export function useStoreSelect<S, T>(store: StateHandle<S>, select: (state: S) => T): T {
  const cache = useRef<{ state: S; value: T } | null>(null)
  const getSnapshot = useCallback((): T => {
    const state = store.getSnapshot()
    if (cache.current !== null && cache.current.state === state) return cache.current.value
    const value = select(state)
    cache.current = { state, value }
    return value
  }, [store, select])
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

/** A callback whose identity never changes but always reads fresh values. */
export function useLatest<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T
}
