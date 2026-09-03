import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { promises as fs } from 'node:fs'
import { makeWav, type Fixture } from '../src/source/fixtures'
import { parseWav } from '../src/source/wav'

/**
 * Seam A. Every test drops a generated fixture through the file input,
 * drives the app with real key presses, and reads what came out.
 * Frames are deterministic because the plain and coarse steps and the
 * insert gap are fractions of the visible window, not of pixels.
 */

const SR = 48000
const SECONDS = 30
const FRAMES = SECONDS * SR

function fixture(fx: Partial<Fixture> & { name?: string }) {
  const full: Fixture = { bits: 16, kind: 'pcm', channels: 2, rate: SR, frames: FRAMES, ...fx }
  const made = makeWav(full)
  return { ...made, name: fx.name ?? 'take.wav', blockAlign: (full.channels * full.bits) / 8 }
}

async function drop(page: Page, name: string, bytes: Uint8Array) {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'audio/wav', buffer: Buffer.from(bytes) })
  await expect(page.locator('.status .mode')).toHaveText('PLAYHEAD')
  await expect(page.locator('header p')).toContainText(name.replace(/\.wav$/, ''))
  await page.locator('.wave-overlay').click({ position: { x: 0, y: 5 } }) // focus; seeks to frame 0
  await page.keyboard.press('Home') // no-op key: settle
}

/** press a spec like 'Alt+KeyL' or 'Shift+KeyI' */
async function keys(page: Page, ...specs: string[]) {
  for (const s of specs) await page.keyboard.press(s)
}

async function nameRegion(page: Page, name: string | null) {
  const input = page.locator('.prompt input')
  await expect(input).toBeFocused()
  if (name != null) await input.fill(name)
  await input.press('Enter')
  await expect(page.locator('.prompt')).toHaveCount(0)
}

test.describe('drop, mark, name, export', () => {
  test('a 24-bit stereo WAV round-trips byte-exact through the zip with the typed names', async ({ page }) => {
    const fx = fixture({ bits: 24, extensible: true, junk: 28, name: 'field.wav' })
    await drop(page, fx.name, fx.bytes)

    // region 1: 12 s to 18 s (four coarse steps of 3 s, then i places the end 20% of 30 s later)
    await keys(page, 'Alt+KeyL', 'Alt+KeyL', 'Alt+KeyL', 'Alt+KeyL')
    await expect(page.locator('.status')).toContainText('12.000s')
    await keys(page, 'KeyI')
    await expect(page.locator('.status .mode')).toHaveText('INSERT REGION')
    await keys(page, 'KeyS')
    await nameRegion(page, 'kick')
    await expect(page.locator('.status .mode')).toHaveText('PLAYHEAD')
    await expect(page.locator('.status')).toContainText('18.000s')

    // region 2: I from 18 s places the start 6 s earlier, overlapping; keep the automatic name
    await keys(page, 'Shift+KeyI', 'KeyS')
    await nameRegion(page, null)

    // region 3: a name that needs sanitising and collides with region 1 case-insensitively
    await keys(page, 'KeyI', 'KeyS')
    await nameRegion(page, 'KICK/1')

    await expect(page.locator('.status')).toContainText('regions 3')

    const download = page.waitForEvent('download')
    await keys(page, 'Meta+KeyE')
    const zipPath = await (await download).path()
    const zip = await JSZip.loadAsync(await fs.readFile(zipPath!))
    expect(Object.keys(zip.files).sort()).toEqual(['KICK_1.wav', 'field-01.wav', 'kick.wav', 'regions.json'])

    const json = JSON.parse(await zip.file('regions.json')!.async('string'))
    const expected: Record<string, [number, number]> = {
      'field-01.wav': [12 * SR, 18 * SR], // I from 18 s: start 12 s, end 18 s; same bounds as kick, so it sorts second
      'kick.wav': [12 * SR, 18 * SR],
      'KICK_1.wav': [18 * SR, 24 * SR],
    }
    for (const r of json.regions as { file: string; start: number; end: number }[]) {
      expect([r.start, r.end], r.file).toEqual(expected[r.file])
    }
    for (const [file, [start, end]] of Object.entries(expected)) {
      const entry = new Uint8Array(await zip.file(file)!.async('uint8array'))
      const layout = parseWav(entry, entry.length) as { frames: number; dataOffset: number; fmtChunk: Uint8Array }
      expect(layout.frames).toBe(end - start)
      expect(Array.from(layout.fmtChunk)).toEqual(Array.from(fx.fmtChunk))
      const body = entry.subarray(layout.dataOffset)
      const original = fx.bytes.subarray(fx.dataOffset + start * fx.blockAlign, fx.dataOffset + end * fx.blockAlign)
      expect(body.length).toBe(original.length)
      expect(Buffer.compare(Buffer.from(body), Buffer.from(original))).toBe(0)
    }
  })

  test('E downloads a single chop of a float WAV with a fact chunk', async ({ page }) => {
    const fx = fixture({ bits: 32, kind: 'float', channels: 1, name: 'float.wav' })
    await drop(page, fx.name, fx.bytes)
    await keys(page, 'Alt+KeyL', 'KeyI', 'KeyS')
    await nameRegion(page, 'swell')
    await keys(page, 'Tab')
    await expect(page.locator('.status .mode')).toHaveText('REGION SELECT')
    const download = page.waitForEvent('download')
    await keys(page, 'Shift+KeyE')
    const d = await download
    expect(d.suggestedFilename()).toBe('swell.wav')
    const bytes = new Uint8Array(await fs.readFile((await d.path())!))
    const layout = parseWav(bytes, bytes.length) as { frames: number; format: { kind: string } }
    expect(layout.frames).toBe(6 * SR)
    expect(layout.format.kind).toBe('float')
    expect(Buffer.from(bytes).indexOf('fact')).toBeGreaterThan(0)
  })

  test('a WAV with a JUNK chunk before fmt loads and truncation is reported', async ({ page }) => {
    const fx = fixture({ channels: 1, junk: 28, claimDataBytes: 99_999_999, name: 'cut.wav' })
    await drop(page, fx.name, fx.bytes)
    await expect(page.locator('header p')).toContainText('truncated')
  })
})

test.describe('keys and modes', () => {
  test('Space never scrolls the page and playback runs without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const fx = fixture({ channels: 1 })
    await page.setViewportSize({ width: 900, height: 400 }) // short viewport: the page can scroll
    await drop(page, fx.name, fx.bytes)
    await keys(page, 'Alt+KeyL', 'KeyI', 'KeyS')
    await nameRegion(page, null)
    await page.evaluate(() => window.scrollTo(0, 0))
    await keys(page, 'Space')
    await expect(page.locator('.status')).toContainText('playing playhead')
    await keys(page, 'KeyL') // restart on scrub
    await keys(page, 'Space')
    await expect(page.locator('.status')).toContainText('stopped')
    await keys(page, 'KeyA') // audition
    await keys(page, 'Tab')
    await page.keyboard.down('Space')
    await expect(page.locator('.status')).toContainText('held, looping')
    await page.waitForTimeout(300)
    await page.keyboard.up('Space')
    await keys(page, 'Space') // stop, or a no-op if the pass already finished
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(errors).toEqual([])
  })

  test('Tab with no regions shakes and toasts; cycling never moves the playhead', async ({ page }) => {
    const fx = fixture({ channels: 1 })
    await drop(page, fx.name, fx.bytes)
    await keys(page, 'Tab')
    await expect(page.locator('.toast')).toContainText('No regions yet')
    await expect(page.locator('.status .mode')).toHaveText('PLAYHEAD')
    await keys(page, 'Alt+KeyL', 'KeyI', 'KeyS')
    await nameRegion(page, null)
    await keys(page, 'KeyI', 'KeyS')
    await nameRegion(page, null)
    await keys(page, 'Alt+KeyH')
    const before = await page.locator('.status').textContent()
    await keys(page, 'Tab', 'KeyL', 'KeyH', 'KeyL', 'Escape')
    const after = await page.locator('.status').textContent()
    expect(after?.match(/playhead ([\d.]+s)/)?.[1]).toBe(before?.match(/playhead ([\d.]+s)/)?.[1])
  })
})

test.describe('persistence', () => {
  test('regions come back after a reload and re-drop', async ({ page }) => {
    const fx = fixture({ channels: 1, name: 'session.wav' })
    await drop(page, fx.name, fx.bytes)
    await keys(page, 'Alt+KeyL', 'KeyI', 'KeyS')
    await nameRegion(page, 'one')
    await keys(page, 'KeyI', 'KeyS')
    await nameRegion(page, 'two')
    await expect(page.locator('.status')).toContainText('regions 2')
    await page.waitForTimeout(400) // autosave debounce
    await page.reload()
    await page.locator('input[type=file]').setInputFiles({ name: fx.name, mimeType: 'audio/wav', buffer: Buffer.from(fx.bytes) })
    await expect(page.locator('.status')).toContainText('regions 2')
    await expect(page.locator('.toast')).toContainText('Restored 2 regions')
    await expect(page.locator('table')).toContainText('one.wav')
    await expectPluginRegionsAligned(page)
    await keys(page, 'Shift+Slash') // toggle the tutorial: the container resizes and wavesurfer redraws
    await page.waitForTimeout(400)
    await expectPluginRegionsAligned(page)
  })
})

/** wavesurfer's region fills must sit where the overlay puts the same regions */
async function expectPluginRegionsAligned(page: Page) {
  const st = await page.evaluate(() => {
    const s = (window as unknown as { __h11y: { view: { win: number; start: number }; regions: { id: number; start: number; end: number }[] } }).__h11y
    return { view: s.view, regions: s.regions }
  })
  const overlay = await page.locator('.wave-overlay').boundingBox()
  expect(overlay).not.toBeNull()
  const fills = page.locator('.wave-ws [part~="region"]')
  await expect(fills).toHaveCount(st.regions.length)
  for (let i = 0; i < st.regions.length; i++) {
    const box = await fills.nth(i).boundingBox()
    expect(box).not.toBeNull()
    const id = Number((await fills.nth(i).getAttribute('part'))!.match(/r(\d+)/)![1])
    const r = st.regions.find((x) => x.id === id)!
    const expectedLeft = overlay!.x + ((r.start - st.view.start) / st.view.win) * overlay!.width
    const expectedRight = overlay!.x + ((r.end - st.view.start) / st.view.win) * overlay!.width
    expect(Math.abs(box!.x - expectedLeft), `region ${id} left`).toBeLessThan(3)
    expect(Math.abs(box!.x + box!.width - expectedRight), `region ${id} right`).toBeLessThan(3)
  }
}

test.describe('tutorial', () => {
  test('the demo recording opens with the tutorial and "Do it for me" drives the same keys', async ({ page }) => {
    await page.goto('/')
    await page.locator('.drop .demo').click()
    await expect(page.locator('.status .mode')).toHaveText('PLAYHEAD')
    await expect(page.locator('.tutorial')).toBeVisible()
    const buttons = page.locator('.tutorial button.do')
    await buttons.nth(0).click() // four coarse steps
    await expect(page.locator('.status')).toContainText('12.000s')
    await buttons.nth(1).click() // i
    await expect(page.locator('.status .mode')).toHaveText('INSERT REGION')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+Slash') // ? closes the tutorial
    await expect(page.locator('.tutorial')).toHaveCount(0)
    await page.keyboard.press('Shift+Slash')
    await expect(page.locator('.tutorial')).toBeVisible()
    await page.locator('.tutorial .tabs button', { hasText: 'Keymap' }).click()
    await expect(page.locator('.tutorial')).toContainText('Region Select mode')
  })
})
