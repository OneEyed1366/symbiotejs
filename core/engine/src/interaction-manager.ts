// InteractionManager — schedule long-running work to run only after any active
// interactions/animations have completed, so JS animations stay smooth. A faithful
// port of React Native's Libraries/Interaction/InteractionManager (the queue-backed
// implementation, not the deprecated no-op stub).
//
// It is pure JS — timers + a tiny event emitter, no React and no native bridge — so
// per symbiote's layering invariant it lives in @symbiote/engine, where every adapter
// re-exports it.
//
// Mechanics: each `runAfterInteractions` task is pushed onto a queue and the queue is
// flushed on the next tick. `createInteractionHandle` increments an outstanding-handle
// count that blocks the flush; `clearInteractionHandle` decrements it and, when the
// last handle clears, schedules a flush on the next tick. `interactionStart` /
// `interactionComplete` fire as the count crosses 0.

import { dlog } from './debug'

// A positive deadline (ms) makes the flush yield via setTimeout once that much event-
// loop time has elapsed within one batch, letting touches interrupt; 0 (default) runs
// the whole batch in one setImmediate.
const DEFAULT_DEADLINE = 0

// setTimeout delay used both to yield to the event loop and to resume after the last
// handle clears: a 0ms macrotask, never a real wait.
const NEXT_TICK_MS = 0

export const Events = {
  interactionStart: 'interactionStart',
  interactionComplete: 'interactionComplete',
} as const

export type InteractionEvent = (typeof Events)[keyof typeof Events]

// A plain callback, or an object task with either a sync `run` or an async `gen`.
export type SimpleTask = {
  name: string
  run: () => void
}
export type PromiseTask = {
  name: string
  gen: () => Promise<unknown>
}
export type Task = SimpleTask | PromiseTask | (() => void)

export type Handle = number

// The cancellable promise-like `runAfterInteractions` returns.
export type Cancellable<T> = {
  then: Promise<T>['then']
  done: (onDone?: () => void) => void
  cancel: () => void
}

type EventListener = (...args: unknown[]) => void

function isSimpleTask(task: object): task is SimpleTask {
  return typeof Reflect.get(task, 'run') === 'function'
}

function isPromiseTask(task: object): task is PromiseTask {
  return typeof Reflect.get(task, 'gen') === 'function'
}

// Minimal string→listener-set emitter; we don't pull in events.ts to keep this module
// self-contained, and the surface here is just on/off/emit over two event names.
class Emitter {
  private listeners = new Map<string, Set<EventListener>>()

  on(eventType: string, listener: EventListener): () => void {
    let set = this.listeners.get(eventType)
    if (set === undefined) {
      set = new Set()
      this.listeners.set(eventType, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
    }
  }

  emit(eventType: string, ...args: unknown[]): void {
    const set = this.listeners.get(eventType)
    if (set === undefined) return
    for (const listener of [...set]) listener(...args)
  }
}

// Lazily resolve Node's setImmediate, falling back to a 0ms setTimeout where it is
// absent (browsers, some RN hosts). A runtime guard keeps us off `as`.
function scheduleImmediate(callback: () => void): void {
  const candidate = Reflect.get(globalThis, 'setImmediate')
  if (typeof candidate === 'function') {
    candidate(callback)
    return
  }
  scheduleTimeout(callback, NEXT_TICK_MS)
}

// The host timer, read lazily off globalThis (shared's tsconfig does not type timers
// on globalThis — the same reason raf.ts reaches them through Reflect.get).
function scheduleTimeout(callback: () => void, ms: number): void {
  const candidate = Reflect.get(globalThis, 'setTimeout')
  if (typeof candidate === 'function') candidate(callback, ms)
}

class InteractionManagerImpl {
  readonly Events = Events

  private emitter = new Emitter()
  private taskQueue: Task[] = []
  private interactionHandleCount = 0
  private nextHandle = 1
  private deadline = DEFAULT_DEADLINE
  private flushScheduled = false

  addListener(eventType: InteractionEvent, listener: EventListener): { remove: () => void } {
    const off = this.emitter.on(eventType, listener)
    return { remove: off }
  }

  // Schedule a task to run once all interaction handles have cleared and the queue
  // drains. Returns a cancellable promise-like.
  runAfterInteractions(task?: Task): Cancellable<void> {
    let resolveTask: (() => void) | undefined
    let rejectTask: ((error: Error) => void) | undefined
    const promise = new Promise<void>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    const queued: Task = () => {
      this.runTask(task, resolveTask, rejectTask)
    }
    let cancelled = false
    const guarded: Task = () => {
      if (cancelled) return
      queued()
    }

    this.taskQueue.push(guarded)
    this.scheduleFlush()

    return {
      then: promise.then.bind(promise),
      done: (onDone?: () => void): void => {
        // RN's `done` is `then` run for effect — fire and forget.
        void promise.then(onDone)
      },
      cancel: (): void => {
        cancelled = true
      },
    }
  }

  // Notify the manager an interaction has started; defers queued tasks. Returns a
  // handle to clear when the interaction ends.
  createInteractionHandle(): Handle {
    dlog('InteractionManager.createInteractionHandle')
    const wasIdle = this.interactionHandleCount === 0
    this.interactionHandleCount += 1
    if (wasIdle) this.emitter.emit(Events.interactionStart)
    const handle = this.nextHandle
    this.nextHandle += 1
    return handle
  }

  // Notify the manager an interaction has completed; the last clear resumes the queue.
  clearInteractionHandle(handle: Handle): void {
    if (!handle) throw new Error('InteractionManager: Must provide a handle to clear.')
    dlog(`InteractionManager.clearInteractionHandle(${handle})`)
    this.interactionHandleCount -= 1
    if (this.interactionHandleCount === 0) {
      this.emitter.emit(Events.interactionComplete)
      // Resume on the next tick so synchronous clear→schedule pairs still yield once.
      scheduleTimeout(() => {
        this.scheduleFlush()
      }, NEXT_TICK_MS)
    }
  }

  setDeadline(deadline: number): void {
    this.deadline = deadline
  }

  private runTask(
    task: Task | undefined,
    resolveTask: (() => void) | undefined,
    rejectTask: ((error: Error) => void) | undefined,
  ): void {
    const resolve = resolveTask ?? ((): void => {})
    const reject = rejectTask ?? ((): void => {})
    if (task === undefined || task === null) {
      resolve()
      return
    }
    if (typeof task === 'function') {
      try {
        task()
        resolve()
      } catch (error: unknown) {
        reject(toError(error))
      }
      return
    }
    if (isPromiseTask(task)) {
      task.gen().then(() => resolve(), reject)
      return
    }
    if (isSimpleTask(task)) {
      try {
        task.run()
        resolve()
      } catch (error: unknown) {
        reject(toError(error))
      }
      return
    }
    reject(new TypeError('InteractionManager task object must have a gen or run method.'))
  }

  // Schedule a single flush of the queue on the next tick, coalescing multiple
  // schedule calls within the same tick into one.
  private scheduleFlush(): void {
    if (this.flushScheduled) return
    if (this.taskQueue.length === 0) return
    this.flushScheduled = true
    scheduleImmediate(() => {
      this.flushScheduled = false
      this.flushQueue()
    })
  }

  // Drain the queue while no handles are outstanding, honouring the deadline by
  // yielding via setTimeout when one batch overruns it.
  private flushQueue(): void {
    if (this.interactionHandleCount > 0) return
    const startTime = Date.now()
    while (this.taskQueue.length > 0) {
      if (this.interactionHandleCount > 0) return
      const next = this.taskQueue.shift()
      if (next === undefined) break
      if (typeof next === 'function') next()
      if (this.deadline > DEFAULT_DEADLINE && Date.now() - startTime >= this.deadline) {
        if (this.taskQueue.length > 0) {
          scheduleTimeout(() => {
            this.flushQueue()
          }, NEXT_TICK_MS)
        }
        return
      }
    }
  }
}

// Coerce a thrown unknown into an Error without `as`, mirroring RN's toError.
function toError(value: unknown): Error {
  if (value instanceof Error) return value
  return new Error(typeof value === 'string' ? value : 'Unknown InteractionManager task error')
}

export const InteractionManager = new InteractionManagerImpl()
