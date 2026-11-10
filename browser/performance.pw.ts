import { test, expect } from '@playwright/test'

test('measure production canvas edits, dragging and trace scrubbing on a 12 by 12 grid', async ({
  page,
  browser,
}) => {
  const side = 12
  const nodes = Array.from({ length: side * side }, (_, i) => ({
    id: 'V' + i,
    x: (i % side) * 120,
    y: Math.floor(i / side) * 85,
  }))
  const edges = nodes.flatMap((n, i) => [
    ...(i % side < side - 1 ? [{ from: n.id, to: 'V' + (i + 1) }] : []),
    ...(i + side < nodes.length ? [{ from: n.id, to: 'V' + (i + side) }] : []),
  ])
  await page.goto('/')
  await page
    .getByLabel('Import graph file')
    .setInputFiles({
      name: 'grid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          directed: false,
          weighted: false,
          nodes,
          edges,
          start: 'V0',
          destination: 'V143',
        }),
      ),
    })
  await expect(page.getByRole('heading', { name: 'grid.json' })).toBeVisible()
  await expect(page.locator('.counts')).toContainText('144 nodes')
  const editTimes = await page.evaluate(async () => {
    const frame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    const button = (text: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('.sidebar button')].find(
        (b) => b.textContent === text,
      )!
    const times = []
    for (let i = 0; i < 10; i++) {
      // Import and undo both refit the viewport. Measure editing once the tool is ready.
      const add = button('Add node')
      const deadline = performance.now() + 5000
      while (add.disabled && performance.now() < deadline) await frame()
      if (add.disabled) throw Error('Node placement did not become available')
      const start = performance.now()
      add.click()
      await frame()
      if (!document.querySelector('.counts')?.textContent?.includes('145 nodes'))
        throw Error('Node edit did not commit')
      if (i > 0) times.push(performance.now() - start)
      button('Undo').click()
      await frame()
    }
    return times
  })
  await page.getByRole('button', { name: 'Fit graph' }).click()
  const vertex = page.locator('.react-flow__node[data-id="n65"]')
  await expect(vertex).toBeVisible()
  const box = (await vertex.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2
  const frames = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const samples: number[] = []
        let last = 0
        function tick(t: number) {
          if (last) samples.push(t - last)
          last = t
          if (samples.length === 55) resolve(samples)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 65; i++) {
    await page.mouse.move(x + i, y + i / 3)
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  await page.mouse.up()
  const intervals = await frames
  expect((await vertex.boundingBox())!.x).toBeGreaterThan(box.x + 40)
  await page.getByRole('button', { name: 'Run algorithm' }).click()
  await expect(page.getByText('Route found', { exact: true })).toBeVisible()
  const slider = page.getByRole('slider'),
    count = Number(await slider.getAttribute('max'))
  const scrubTimes = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>('#timeline')!,
      times = []
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    for (let i = 1; i <= 10; i++) {
      const step = Math.floor((Number(input.max) * ((i * 7) % 11)) / 10)
      const start = performance.now()
      set.call(input, String(step))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      if (!document.querySelector('.timeline label')?.textContent?.includes('Step ' + step + ' /'))
        throw Error('Trace did not scrub')
      if (i > 1) times.push(performance.now() - start)
    }
    return times
  })
  function median(a: number[]) {
    return a.sort((x, y) => x - y)[Math.floor(a.length / 2)]!.toFixed(2)
  }
  console.log(
    JSON.stringify({
      browser: browser.version(),
      nodes: nodes.length,
      edges: edges.length,
      events: count,
      editToSecondFrameMedianMs: median(editTimes),
      scrubToSecondFrameMedianMs: median(scrubTimes),
      dragFrameMedianMs: median(intervals),
      dragFrameP95Ms: intervals[Math.ceil(intervals.length * 0.95) - 1]!.toFixed(2),
    }),
  )
})
