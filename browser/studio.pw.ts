import { test, expect, chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { channel } from '../playwright.config.ts'

test('invalid edits preserve the graph and text editing protects the selection', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  await page.getByRole('button', { name: 'Add edge', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Create edge' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Duplicate edge')
  await page.keyboard.press('Escape')
  await expect(page.locator('.counts')).toHaveText('5 nodes · 5 edges')
  const vertex = page.locator('.react-flow__node').first()
  await vertex.focus()
  await page.keyboard.press('Enter')
  const id = page.getByLabel('Node ID', { exact: true })
  await id.fill('Garden')
  await page.getByRole('button', { name: 'Apply node' }).click()
  await expect(page.getByRole('alert')).toContainText('Duplicate node')
  await id.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
  await page.getByLabel('Destination', { exact: true }).selectOption('Library')
  await page.getByRole('button', { name: 'Run algorithm' }).click()
  await expect(page.locator('.metrics div').filter({ hasText: 'Path cost' })).toHaveText(
    'Path cost0',
  )
})

test('empty startup, create, drag, connect, inspect, keyboard delete and undo', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Build your first graph' })).toBeVisible()
  const add = page.locator('.sidebar').getByRole('button', { name: 'Add node' })
  await add.click()
  const first = page.locator('.react-flow__node').first(),
    box = await first.boundingBox()
  expect(box).toBeTruthy()
  const x = box!.x + box!.width / 2,
    y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 130, y - 50, { steps: 8 })
  await page.mouse.up()
  expect((await first.boundingBox())!.x).toBeLessThan(x - 80)
  await add.click()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  const source = await page.locator('.react-flow__node').nth(0).locator('.source').boundingBox()
  const target = await page.locator('.react-flow__node').nth(1).locator('.target').boundingBox()
  await page.mouse.move(source!.x + 5, source!.y + 5)
  await page.mouse.down()
  await page.mouse.move(target!.x + 5, target!.y + 5, { steps: 16 })
  await page.mouse.up()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByLabel('Weight', { exact: true }).fill('3.5')
  await page.getByRole('button', { name: 'Apply weight' }).click()
  await page.getByRole('button', { name: 'Run algorithm' }).click()
  await expect(page.locator('.metrics div').filter({ hasText: 'Path cost' })).toHaveText(
    'Path cost3.5',
  )
  await first.click()
  await page.getByLabel('Node ID').fill('A')
  await page.getByRole('button', { name: 'Apply node' }).click()
  await expect(page.getByLabel('Start node')).toHaveValue('A')
  await expect(page.getByText('Route found', { exact: true })).toHaveCount(0)
  await first.click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  expect(errors).toEqual([])
})
test('four real searches, playback, compare, export, invalid import and round trip', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example', exact: true }).click()
  for (const [algorithm, cost] of [
    ['bfs', '10'],
    ['dfs', '10'],
    ['astar', '5'],
    ['dijkstra', '5'],
  ] as const) {
    await page.getByLabel('Algorithm', { exact: true }).selectOption(algorithm)
    await page.getByRole('button', { name: 'Run algorithm' }).click()
    await expect(page.locator('.metrics div').filter({ hasText: 'Path cost' })).toHaveText(
      'Path cost' + cost,
    )
  }
  await expect(page.locator('.react-flow__minimap-node')).toHaveCount(5)
  const slider = page.getByRole('slider'),
    count = Number(await slider.getAttribute('max'))
  await page.getByRole('button', { name: 'Step forward', exact: true }).click()
  await expect(slider).toHaveValue('1')
  await page.getByRole('button', { name: 'Step backward', exact: true }).click()
  await expect(slider).toHaveValue('0')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => slider.inputValue()).not.toBe('0')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await slider.focus()
  await page.keyboard.press('End')
  await expect(slider).toHaveValue(String(count))
  await expect(page.locator('.vertex.path')).toHaveCount(4)
  await page.getByRole('button', { name: 'Restart playback' }).click()
  await expect(slider).toHaveValue('0')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Compare all four' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(4)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const buffer = await readFile((await (await download).path())!)
  const input = page.getByLabel('Import graph file')
  await input.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  await expect(page.getByRole('alert')).toBeVisible()
  await input.setInputFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer })
  await expect(page.getByRole('heading', { name: 'roundtrip.json' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
  await expect(slider).toBeDisabled()
})
test('preferences survive browser process restart while graph starts empty', async ({}, info) => {
  const profile = info.outputPath('profile')
  const launch = () =>
    chromium.launchPersistentContext(profile, { headless: true, ...(channel ? { channel } : {}) })
  let ctx = await launch()
  try {
    let page = await ctx.newPage()
    await page.goto('http://127.0.0.1:4286')
    await page.getByRole('button', { name: 'Load example', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Theme', { exact: true }).selectOption('light')
    await page.getByLabel('Snap to grid').check()
    await page.getByRole('dialog').getByLabel('Playback speed').selectOption('4')
    await ctx.close()
    ctx = await launch()
    page = await ctx.newPage()
    await page.goto('http://127.0.0.1:4286')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('heading', { name: 'Build your first graph' })).toBeVisible()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByLabel('Snap to grid')).toBeChecked()
    await expect(page.getByRole('dialog').getByLabel('Playback speed')).toHaveValue('4')
    await page.getByRole('button', { name: 'Reset preferences' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  } finally {
    await ctx.close()
  }
})
test('mobile controls and full results for a truncated large graph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Tools', exact: true }).click()
  const nodes = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), x: i, y: 0 }))
  const graph = {
    directed: true,
    weighted: false,
    start: '0',
    destination: '2999',
    nodes,
    edges: nodes.slice(1).map((n, i) => ({ from: String(i), to: n.id })),
  }
  await page.getByLabel('Import graph file').setInputFiles({
    name: 'chain.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(graph)),
  })
  await expect(page.getByText('Graph overview mode')).toBeVisible()
  await page.getByRole('button', { name: 'Tools', exact: true }).click()
  await page.getByRole('button', { name: 'Run algorithm' }).click()
  await page.getByRole('button', { name: 'Inspector', exact: true }).click()
  await expect(page.getByText(/Partial playback · first/)).toBeVisible()
  await expect(page.locator('.metrics div').filter({ hasText: 'Path cost' })).toHaveText(
    'Path cost2999',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
