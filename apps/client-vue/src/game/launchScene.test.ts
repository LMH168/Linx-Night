import { describe, expect, it, vi } from 'vitest'
import { optimizeCabinRuntime } from './launchScene'

describe('启动场景轻量渲染', () => {
  it('统一限制像素比、关闭阴影并绕过后处理', () => {
    const composer = { render: vi.fn(), setPixelRatio: vi.fn() }
    const renderer = { setPixelRatio: vi.fn(), render: vi.fn(), shadowMap: { enabled: true } }
    const win = { devicePixelRatio: 2, __forestCabin: { renderer, composer, scene: {}, camera: {} }, postMessage: vi.fn() } as any

    optimizeCabinRuntime(win)

    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1)
    expect(renderer.shadowMap.enabled).toBe(false)
    expect(composer.setPixelRatio).toHaveBeenCalledWith(1)
    composer.render()
    expect(renderer.render).toHaveBeenCalledWith(win.__forestCabin.scene, win.__forestCabin.camera)
    expect(win.postMessage).toHaveBeenCalledWith({ type: 'linx-cabin-optimized' }, '*')
  })
})
