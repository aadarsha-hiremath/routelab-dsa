import { test, expect, chromium, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { channel } from '../playwright.config.ts'
import campus from '../examples/campus.json' with { type: 'json' }
const origin = 'http://127.0.0.1:4286'
const saved = (page: Page) =>
  expect(page.getByLabel('Local save status')).toHaveText('Saved locally')
const restore = (page: Page) =>
  page.getByRole('button', { name: 'Restore workspace', exact: true }).click()
const discard = (page: Page) =>
  page.getByRole('button', { name: 'Discard saved workspace and start empty' }).click()
async function exported(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
}
async function seed(page: Page, value: unknown) {
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('routelab-recovery', 1)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('recovery', 'readwrite')
          tx.objectStore('recovery').put(record, 'document')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onabort = () => reject(tx.error)
        }
        open.onerror = () => reject(open.error)
      }),
    value,
  )
}
test('complete browser restarts preserve edited graph, metadata, all preferences and explicit recovery decisions', async ({}, info) => {
  const profile = info.outputPath('workspace-profile')
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      ...(channel ? { channel } : {}),
      viewport: { width: 1440, height: 900 },
    })
  let ctx = await launch()
  const newPage = async () => {
    const p = await ctx.newPage()
    await p.goto(origin)
    return p
  }
  try {
    let page = await newPage()
    const doc = { ...campus, metadata: { course: 'DSA', tags: ['lab'] } }
    await page
      .getByLabel('Import graph file')
      .setInputFiles({
        name: 'My routes.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(doc)),
      })
    await page.getByRole('group', { name: 'Node Library', exact: true }).click()
    await page.getByLabel('Node ID', { exact: true }).fill('Start ✦')
    await page.getByLabel('X', { exact: true }).fill('-83')
    await page.getByRole('button', { name: 'Apply node' }).click()
    await page.getByLabel('Directed edges').check()
    await page.getByLabel('Destination', { exact: true }).selectOption('Garden')
    await page.getByRole('button', { name: 'Add edge', exact: true }).click()
    await page.getByLabel('Edge weight').fill('0')
    await page.getByRole('button', { name: 'Create edge', exact: true }).click()
    await saved(page)
    const snapshot = await exported(page)
    expect(snapshot).toMatchObject({
      start: 'Start ✦',
      destination: 'Garden',
      directed: true,
      weighted: true,
      metadata: doc.metadata,
    })
    expect(snapshot.nodes[0]).toMatchObject({ id: 'Start ✦', x: -83 })
    expect(snapshot.edges.at(-1).weight).toBe(0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Studio settings' })
    await settings.getByLabel('Theme', { exact: true }).selectOption('system')
    await settings.getByLabel('Playback speed').selectOption('8')
    await settings.getByLabel('Reduce motion').check()
    await settings.getByLabel('Canvas grid').uncheck()
    await settings.getByLabel('Snap to grid').check()
    await settings.getByLabel('Show minimap').uncheck()
    await ctx.close()
    ctx = await launch()
    page = await newPage()
    await expect(page.getByRole('dialog', { name: 'Restore previous workspace' })).toContainText(
      'My routes.json',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Review saved workspace' })).toBeVisible()
    await page.reload()
    await restore(page)
    expect(await exported(page)).toEqual(snapshot)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Studio settings' })
    await expect(form.getByLabel('Playback speed')).toHaveValue('8')
    await expect(form.getByLabel('Theme', { exact: true })).toHaveValue('system')
    for (const label of ['Snap to grid', 'Reduce motion'])
      await expect(form.getByLabel(label)).toBeChecked()
    for (const label of ['Canvas grid', 'Show minimap'])
      await expect(form.getByLabel(label)).not.toBeChecked()
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await form.getByRole('button', { name: 'Reset preferences' }).click()
    await form.getByRole('button', { name: 'Close dialog' }).click()
    await ctx.close()
    ctx = await launch()
    page = await newPage()
    await discard(page)
    await expect(page.getByLabel('Local save status')).toHaveText('Local workspace')
    await ctx.close()
    ctx = await launch()
    page = await newPage()
    await expect(page.getByLabel('Local save status')).toHaveText('Local workspace')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const defaults = page.getByRole('dialog')
    await expect(defaults.getByLabel('Theme', { exact: true })).toHaveValue('dark')
    await expect(defaults.getByLabel('Playback speed')).toHaveValue('1')
    for (const label of ['Canvas grid', 'Show minimap'])
      await expect(defaults.getByLabel(label)).toBeChecked()
    for (const label of ['Snap to grid', 'Reduce motion'])
      await expect(defaults.getByLabel(label)).not.toBeChecked()
  } finally {
    await ctx.close()
  }
})
test('clear and undo/redo are ordered, including rapid consecutive edits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await page.getByRole('button', { name: 'Clear workspace' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await saved(page)
  await page.reload()
  await restore(page)
  await expect(page.getByRole('heading', { name: 'Campus paths' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear workspace' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await saved(page)
  await page.reload()
  await expect(page.getByLabel('Local save status')).toHaveText('Local workspace')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('overlapping tabs cannot overwrite or resurrect a newer recovery record', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await saved(page)
  const other = await context.newPage()
  await other.goto(origin)
  await discard(other)
  await expect(other.getByLabel('Local save status')).toHaveText('Local workspace')
  await page.getByLabel('Directed edges').check()
  await expect(page.getByRole('alert')).toContainText('Another tab')
  expect((await exported(page)).directed).toBe(true)
  await other.reload()
  await expect(other.getByLabel('Local save status')).toHaveText('Local workspace')
  await expect(other.getByRole('dialog')).toHaveCount(0)
})
test('queued commits show Saving until durable and recover only the final snapshot', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await saved(page)
  // Hold a real IndexedDB transaction so all three subsequent writes overlap.
  await page.evaluate(
    () =>
      new Promise<void>((ready, reject) => {
        const open = indexedDB.open('routelab-recovery', 1)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('recovery', 'readwrite'),
            store = tx.objectStore('recovery')
          let held = true
          window.addEventListener(
            'release-transaction',
            () => {
              held = false
            },
            { once: true },
          )
          function keepAlive() {
            if (held) store.get('revision').onsuccess = keepAlive
          }
          store.get('revision').onsuccess = () => {
            keepAlive()
            ready()
          }
          tx.oncomplete = () => db.close()
        }
      }),
  )
  await page.getByLabel('Directed edges').check()
  await page.getByRole('button', { name: 'Clear workspace' }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Local save status')).toHaveText('Saving')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('release-transaction'))
  })
  await saved(page)
  await page.reload()
  await restore(page)
  expect(await exported(page)).toEqual({ ...campus, directed: true })
})
test('a failed transaction retains the prior copy and can retry the latest edit', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await saved(page)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'document') {
        IDBObjectStore.prototype.put = put
        throw new DOMException('Storage quota reached.', 'QuotaExceededError')
      }
      return put.call(this, value, key)
    }
  })
  await page.getByLabel('Directed edges').check()
  await expect(page.getByLabel('Local save status')).toHaveText('Save failed')
  await expect(page.getByRole('alert')).toContainText('quota')
  const prior = await page.context().newPage()
  await prior.goto(origin)
  await restore(prior)
  await expect(prior.getByLabel('Directed edges')).not.toBeChecked()
  await page.getByRole('button', { name: 'Retry save' }).click()
  await saved(page)
  await page.reload()
  await restore(page)
  await expect(page.getByLabel('Directed edges')).toBeChecked()
})
test('corrupt and future-version records require explicit discard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Local save status')).toHaveText('Local workspace')
  for (const input of [
    { version: 9 },
    { version: 1, workspace: { name: 'broken', graph: { ...campus, nodes: null } } },
  ]) {
    await seed(page, input)
    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Saved workspace unavailable' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Saved workspace unavailable' })).toBeVisible()
    await discard(page)
    await expect(page.getByLabel('Local save status')).toHaveText('Local workspace')
  }
})
test('blocked storage allows editing and export and reports both graph and preference failures', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw Error('Blocked')
      },
    })
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError')
    }
  })
  await page.goto('/')
  await expect(page.getByLabel('Local save status')).toHaveText('Save failed')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  expect(await exported(page)).toEqual(campus)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Theme', { exact: true }).selectOption('light')
  await page.keyboard.press('Escape')
  await expect(page.getByText(/Preferences apply for this session/)).toBeVisible()
})
test('weight conversion and edge deletion save through undo, redo and restart of the page', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  page.once('dialog', (d) => d.dismiss())
  await page.getByLabel('Weighted edges').click()
  await expect(page.getByLabel('Weighted edges')).toBeChecked()
  page.once('dialog', (d) => d.accept())
  await page.getByLabel('Weighted edges').uncheck()
  const edge = page.locator('.react-flow__edge').first()
  await edge.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Delete edge', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.counts')).toHaveText('5 nodes · 5 edges')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await saved(page)
  await page.reload()
  await restore(page)
  const graph = await exported(page)
  expect(graph.weighted).toBe(false)
  expect(graph.edges).toEqual(campus.edges.slice(1).map(({ from, to }) => ({ from, to })))
})
test('near-limit imports produce a JSON backup that fits the import limit', async ({ page }) => {
  await page.goto('/')
  const doc = { ...campus, notes: '' }
  const limit = 2 * 1024 * 1024
  doc.notes = 'a'.repeat(limit - Buffer.byteLength(JSON.stringify(doc)))
  const input = page.getByLabel('Import graph file')
  await input.setInputFiles({
    name: 'limit.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await saved(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const backup = await readFile((await (await download).path())!)
  expect(backup.length).toBeLessThanOrEqual(limit)
  expect(JSON.parse(backup.toString())).toEqual(doc)
  await input.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup })
  await expect(page.getByRole('heading', { name: 'backup.json' })).toBeVisible()
})
test('oversize input leaves work intact and long IDs render as inert text across screen sizes', async ({
  page,
}) => {
  await page.goto('/')
  const id = '<img src=x onerror=alert(1)>' + 'length'.repeat(40)
  const doc = {
    ...campus,
    start: id,
    nodes: campus.nodes.map((n) => (n.id === 'Library' ? { ...n, id } : n)),
    edges: campus.edges.map((e) => ({ ...e, from: e.from === 'Library' ? id : e.from })),
  }
  const input = page.getByLabel('Import graph file')
  await input.setInputFiles({
    name: 'labels.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await expect(page.getByRole('group', { name: 'Node ' + id, exact: true })).toBeVisible()
  expect(await page.locator('.vertex img').count()).toBe(0)
  await input.setInputFiles({
    name: 'oversize.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32),
  })
  await expect(page.getByRole('alert')).toContainText('2 MiB')
  expect(await exported(page)).toEqual(doc)
  await page.getByRole('button', { name: 'Settings', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 820 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const settings = page.getByRole('button', { name: 'Settings', exact: true })
    await expect(settings).toBeInViewport({ ratio: 1 })
    await settings.click()
    await expect(page.getByRole('dialog', { name: 'Studio settings' })).toBeVisible()
    await page.keyboard.press('Escape')
  }
})
