// Headless proof of InteractionManager — no simulator, no native, pure JS. We drive
// it over real 0ms macrotasks (the same setImmediate/setTimeout it schedules on) and
// assert three behaviors:
//   (1) runAfterInteractions(task) runs `task` after the current tick when no handles
//       are outstanding;
//   (2) a handle created BEFORE scheduling defers the task until clearInteractionHandle;
//   (3) cancel() on the returned promise-like prevents the task from running.
// A failure here is in shared's queue/handle logic.

import { InteractionManager } from '../../core/engine/src/interaction-manager'

// Resolve on the next macrotask, then again, to give the manager's own next-tick
// scheduling room to fire and drain.
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

async function main(): Promise<void> {
  // ---- case 1: runs after the current tick when no handles exist ----------
  {
    let ran = false
    InteractionManager.runAfterInteractions(() => {
      ran = true
    })
    if (ran) throw new Error('case 1: task must NOT run synchronously')
    await settle()
    if (!ran) throw new Error('case 1: task must run after interactions settle')
  }

  // ---- case 2: an outstanding handle defers the task until it clears -------
  {
    let ran = false
    const handle = InteractionManager.createInteractionHandle()
    InteractionManager.runAfterInteractions(() => {
      ran = true
    })
    await settle()
    if (ran) throw new Error('case 2: task must NOT run while a handle is outstanding')

    InteractionManager.clearInteractionHandle(handle)
    await settle()
    if (!ran) throw new Error('case 2: task must run after the last handle clears')
  }

  // ---- case 3: cancel() prevents the task ----------------------------------
  {
    let ran = false
    const interaction = InteractionManager.runAfterInteractions(() => {
      ran = true
    })
    interaction.cancel()
    await settle()
    if (ran) throw new Error('case 3: a cancelled task must not run')
  }

  // ---- case 4: interactionStart/Complete events fire across the boundary ---
  {
    let started = 0
    let completed = 0
    const startSub = InteractionManager.addListener(InteractionManager.Events.interactionStart, () => {
      started += 1
    })
    const completeSub = InteractionManager.addListener(InteractionManager.Events.interactionComplete, () => {
      completed += 1
    })
    const handle = InteractionManager.createInteractionHandle()
    InteractionManager.clearInteractionHandle(handle)
    startSub.remove()
    completeSub.remove()
    if (started !== 1) throw new Error(`case 4: interactionStart should fire once, got ${started}`)
    if (completed !== 1) throw new Error(`case 4: interactionComplete should fire once, got ${completed}`)
  }

  console.log('interaction-manager.smoke OK')
}

main().catch((error: unknown) => {
  console.error(error)
  throw error instanceof Error ? error : new Error(String(error))
})
