import { test, expect } from '@playwright/test'

test('canvas limits, dense search, viewport, playback and durable save measurements', async ({
  page,
  context,
  browser,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (key !== 'document') return put.call(this, value, key)
      const begin = performance.now(),
        result = put.call(this, value, key)
      performance.measure('snapshot-put', { start: begin, end: performance.now() })
      this.transaction.addEventListener(
        'complete',
        () => performance.measure('snapshot-durable', { start: begin, end: performance.now() }),
        { once: true },
      )
      return result
    }
  })
  await page.goto('/')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const heap = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'JSHeapUsedSize')!
      .value
  const initialHeap = await heap()
  for (const shape of ['limit', 'dense'] as const) {
    const count = shape === 'limit' ? 250 : 22
    const nodes = Array.from({ length: count }, (_, i) => ({
      id: 'V' + i,
      x: (i % 18) * 130,
      y: Math.floor(i / 18) * 80,
    }))
    const edges = nodes.flatMap((n, i) =>
      Array.from({ length: shape === 'limit' ? 2 : count - 1 }, (_, j) => ({
        from: n.id,
        to: nodes[(i + j + 1) % count]!.id,
        weight: j + 1,
      })),
    )
    const doc = {
      nodes,
      edges,
      directed: true,
      weighted: true,
      start: 'V0',
      destination: 'V' + (count - 1),
    }
    const begin = performance.now()
    await page
      .getByLabel('Import graph file')
      .setInputFiles({
        name: shape + '.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(doc)),
      })
    await expect(page.getByRole('heading', { name: shape + '.json' })).toBeVisible()
    await expect(page.getByLabel('Local save status')).toHaveText('Saved locally')
    const importAndSaveMs = performance.now() - begin
    await expect(page.locator('.counts')).toHaveText(count + ' nodes · ' + edges.length + ' edges')
    await page.getByRole('button', { name: 'Run algorithm' }).click()
    await expect(page.locator('.metrics div').filter({ hasText: 'Path cost' })).toHaveText(
      'Path cost' + (count - 1),
    )
    const zoom = page.getByRole('button', { name: 'Zoom in', exact: true })
    const zoomMs = await zoom.evaluate(async (el) => {
      const start = performance.now()
      ;(el as HTMLButtonElement).click()
      await new Promise<void>((res) =>
        requestAnimationFrame(() => requestAnimationFrame(() => res())),
      )
      return performance.now() - start
    })
    await page.getByRole('button', { name: 'Pan tool' }).click()
    const box = (await page.getByTestId('canvas').boundingBox())!
    const transform = () =>
      page.locator('.react-flow__viewport').evaluate((e) => (e as HTMLElement).style.transform)
    const before = await transform(),
      panStart = performance.now()
    await page.mouse.move(box.x + 40, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 110, box.y + 135, { steps: 12 })
    await page.mouse.up()
    await expect.poll(transform).not.toBe(before)
    const panMs = performance.now() - panStart
    await page.getByLabel('Playback speed', { exact: true }).selectOption('8')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const gaps = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const times: number[] = []
          let last = 0
          function tick(t: number) {
            if (last) times.push(t - last)
            last = t
            if (times.length === 60) resolve(times.sort((a, b) => a - b))
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
    )
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    expect(Number(await page.getByRole('slider').inputValue())).toBeGreaterThan(0)
    const timings = await page.evaluate(() =>
      Object.fromEntries(
        ['snapshot-put', 'snapshot-durable'].map((k) => [
          k,
          performance.getEntriesByName(k).at(-1)?.duration,
        ]),
      ),
    )
    console.log(
      JSON.stringify({
        shape,
        browser: browser.version(),
        nodes: count,
        edges: edges.length,
        importAndSaveMs,
        zoomToSecondFrameMs: zoomMs,
        scriptedPanMs: panMs,
        playbackFrameMedianMs: gaps[30],
        playbackFrameP95Ms: gaps[56],
        mainPageJSHeapMiB: (await heap()) / 2 ** 20,
        initialHeapMiB: initialHeap / 2 ** 20,
        ...timings,
      }),
    )
  }
})

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
  await page.getByLabel('Import graph file').setInputFiles({
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
