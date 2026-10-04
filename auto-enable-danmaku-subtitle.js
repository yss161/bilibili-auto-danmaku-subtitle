/**
 * Bilibili-Evolved 用户组件 —— 自动开启弹幕与字幕
 *
 * 功能:
 *  - 进入视频 / 番剧 / 课程页面时, 若弹幕处于关闭状态则自动打开
 *  - 自动打开 CC 字幕, 并按设置中的「字幕语言偏好」选择字幕轨道
 *  - 切换分 P / 连播下一个视频 / 页面跳转时自动重新应用
 *  - 字幕已手动开启时不干预, 尊重用户选择
 *
 * 安装: Bilibili-Evolved 设置 → 通用 → 用户组件 → 从代码安装, 粘贴本文件全部内容
 * (也可将本文件放到任意可访问的 URL, 通过「从 URL 安装」装)
 *
 * 实现参考: the1812/Bilibili-Evolved 内置的 player-agent
 * (src/components/video/player-agent) 的弹幕 / 字幕控制逻辑, 选择器为当前
 * bpx 播放器实际 DOM, 已在真实页面上验证。
 */
(() => {
  'use strict'

  /** 下拉框可选的字幕语言, value 会被安装面板原样显示 */
  const languages = [
    { label: '自动（跟随 B 站偏好 / 第一项）', code: '' },
    { label: '中文（简体）', code: 'zh-Hans' },
    { label: '中文（AI 自动生成）', code: 'ai-zh' },
    { label: '中文（繁體）', code: 'zh-Hant' },
    { label: '中文（香港）', code: 'zh-HK' },
    { label: '中文（普通话）', code: 'zh-CN' },
    { label: '英语', code: 'en' },
    { label: '英语（AI 自动生成）', code: 'ai-en' },
    { label: '英语（美式）', code: 'en-US' },
    { label: '日语', code: 'ja' },
    { label: '韩语', code: 'ko' },
    { label: '俄语', code: 'ru' },
    { label: '德语', code: 'de-DE' },
    { label: '法语', code: 'fr' },
    { label: '西班牙语', code: 'es' },
    { label: '葡萄牙语（巴西）', code: 'pt-BR' },
    { label: '意大利语', code: 'it' },
    { label: '泰语', code: 'th' },
  ]

  /** 从下拉框值 ('中文（简体） [zh-Hans]') 或手填的语言代码解析出 data-lan 代码 */
  const parseLanguageCode = value => {
    if (typeof value !== 'string') {
      return ''
    }
    const embedded = value.match(/\[([A-Za-z0-9-]+)\]\s*$/)
    if (embedded) {
      return embedded[1]
    }
    const trimmed = value.trim()
    return /^[A-Za-z0-9-]+$/.test(trimmed) ? trimmed : ''
  }

  const languageDropdownItems = languages.map(({ label, code }) =>
    code ? `${label} [${code}]` : label,
  )

  // 与 Bilibili-Evolved 内置 player-agent (bpx.ts) 相同的选择器
  const selectors = {
    danmakuSwitch: '.bpx-player-dm-switch input',
    subtitleCloseSwitch: '.bpx-player-ctrl-subtitle-close-switch',
    subtitleLanguageItems:
      '.bpx-player-ctrl-subtitle-major .bpx-player-ctrl-subtitle-language-item',
  }

  /** 轮询等待条件成立, 返回条件值; 超时返回 null */
  const waitFor = async (condition, timeout, step = 250) => {
    const start = Date.now()
    for (;;) {
      const result = condition()
      if (result) {
        return result
      }
      if (Date.now() - start >= timeout) {
        return null
      }
      await new Promise(resolve => setTimeout(resolve, step))
    }
  }

  const createEngine = (settings, coreApis) => {
    let disposed = false
    let applying = false
    let rerunNeeded = false
    let triggerTimer = 0
    const teardownFns = []

    const getOptions = () => (settings && settings.options) || {}

    const showTip = message => {
      if (disposed) {
        return
      }
      const { showTip: enabled } = getOptions()
      if (!enabled || !coreApis || !coreApis.toast) {
        return
      }
      const toast = coreApis.toast
      if (toast.Toast && toast.Toast.info) {
        toast.Toast.info(message, '自动开启弹幕与字幕')
      } else if (typeof toast.showToast === 'function') {
        toast.showToast(message)
      }
    }

    /** 自动开启弹幕: 仅在完全关闭时打开, 「精简弹幕」视为已开启, 不去改动 */
    const applyDanmaku = async () => {
      const input = await waitFor(
        () => (disposed ? 'disposed' : document.querySelector(selectors.danmakuSwitch)),
        10000,
      )
      if (disposed || !input || input === 'disposed') {
        return
      }
      if (input.checked || input.indeterminate) {
        return
      }
      const turnOn = () => {
        input.checked = true
        input.dispatchEvent(new Event('change'))
      }
      turnOn()
      // 播放器可能会稍后用自己的配置覆盖, 校验一次, 被覆盖则重新打开
      await waitFor(() => (disposed ? true : input.checked ? 'ok' : null), 1200, 300)
      if (!disposed && !input.checked) {
        turnOn()
      }
      showTip('已自动开启弹幕')
    }

    /**
     * 选择字幕语言项, 匹配链与内置 player-agent.toggleSubtitle 一致:
     * 精确 data-lan → 同基础语言的非 AI 项 → 同基础语言的 AI 项 → (未指定时) 第一项
     */
    const pickLanguageItem = items => {
      const code = parseLanguageCode(getOptions().subtitleLanguage)
      if (!code) {
        return items[0] || null
      }
      const normalized = code.replace(/^ai-/, '')
      const base = normalized.split('-')[0]
      return (
        items.find(it => it.dataset.lan === code) ||
        items.find(
          it =>
            !(it.dataset.lan || '').startsWith('ai-') &&
            (it.dataset.lan || '').includes(base),
        ) ||
        items.find(it => it.dataset.lan === `ai-${base}`) ||
        null
      )
    }

    /** 自动开启字幕: 仅在「关闭字幕」为当前状态时点击偏好语言项 */
    const applySubtitle = async () => {
      const closeSwitch = await waitFor(
        () => {
          if (disposed) {
            return 'disposed'
          }
          const element = document.querySelector(selectors.subtitleCloseSwitch)
          if (!element) {
            return null
          }
          // 语言项渲染完成才算就绪, 避免点残留的旧数据
          return document.querySelector(selectors.subtitleLanguageItems) ? element : null
        },
        15000,
      )
      if (disposed || !closeSwitch) {
        // 视频没有 CC 字幕, 静默跳过
        return
      }
      if (!closeSwitch.classList.contains('bpx-state-active')) {
        // 字幕已开启 (用户手动打开或已应用过), 不干预
        return
      }
      for (let attempt = 0; attempt < 3 && !disposed; attempt++) {
        const items = [...document.querySelectorAll(selectors.subtitleLanguageItems)]
        const option = pickLanguageItem(items)
        if (!option) {
          showTip('当前视频没有匹配的字幕语言, 未自动开启字幕')
          return
        }
        option.click()
        // 校验生效情况, 播放器未响应时重试
        const applied = await waitFor(
          () => {
            if (disposed) {
              return false
            }
            const element = document.querySelector(selectors.subtitleCloseSwitch)
            if (!element || !element.classList.contains('bpx-state-active')) {
              const active = document.querySelector(
                `${selectors.subtitleLanguageItems}.bpx-state-active`,
              )
              if (active && (!option.dataset.lan || active.dataset.lan === option.dataset.lan)) {
                return 'ok'
              }
            }
            return null
          },
          1500,
          300,
        )
        if (applied) {
          showTip(`已自动开启字幕 (${option.textContent.trim()})`)
          return
        }
        await new Promise(resolve => setTimeout(resolve, 800))
      }
    }

    const applyAll = async () => {
      if (disposed) {
        return
      }
      if (applying) {
        rerunNeeded = true
        return
      }
      applying = true
      try {
        do {
          rerunNeeded = false
          const { enableDanmaku, enableSubtitle } = getOptions()
          if (enableDanmaku !== false) {
            await applyDanmaku()
          }
          if (enableSubtitle !== false) {
            await applySubtitle()
          }
        } while (rerunNeeded && !disposed)
      } finally {
        applying = false
      }
    }

    // 防抖: 首次加载时 videoChange / urlChange 会连续各回调一次, 合并为一次应用
    const onTrigger = () => {
      if (disposed) {
        return
      }
      if (triggerTimer) {
        clearTimeout(triggerTimer)
      }
      triggerTimer = setTimeout(() => {
        triggerTimer = 0
        applyAll()
      }, 1200)
    }

    return {
      setup() {
        const observer = (coreApis && coreApis.observer) || {}
        // 注册时会立即回调一次, 覆盖当前页面; 之后切 P / 换视频 / 跳转时重新应用
        if (typeof observer.videoChange === 'function') {
          observer.videoChange(onTrigger)
          teardownFns.push(() => window.removeEventListener('videoChange', onTrigger))
        } else {
          // 兼容旧版核心: 直接监听核心派发的窗口事件
          window.addEventListener('videoChange', onTrigger)
          teardownFns.push(() => window.removeEventListener('videoChange', onTrigger))
        }
        if (typeof observer.urlChange === 'function') {
          observer.urlChange(onTrigger)
          teardownFns.push(() => window.removeEventListener('urlChange', onTrigger))
        } else {
          window.addEventListener('urlChange', onTrigger)
          teardownFns.push(() => window.removeEventListener('urlChange', onTrigger))
        }
      },
      dispose() {
        disposed = true
        if (triggerTimer) {
          clearTimeout(triggerTimer)
          triggerTimer = 0
        }
        teardownFns.forEach(fn => fn())
        teardownFns.length = 0
      },
    }
  }

  let engine = null
  let lastEntryContext = null

  const component = {
    name: 'autoEnableDanmakuSubtitle',
    displayName: '自动开启弹幕与字幕',
    author: [
      { name: '夏幻玉', link: 'https://space.bilibili.com/610504174' },
      { name: 'yss161', link: 'https://github.com/yss161' },
    ],
    description: '进入视频页时自动打开弹幕; 自动开启 CC 字幕并按偏好语言选择字幕轨道.',
    tags: [
      { name: 'video', displayName: '视频', color: '#2196F3', icon: 'mdi-play-circle-outline', order: 1 },
    ],
    enabledByDefault: true,
    urlInclude: [
      /^https?:\/\/www\.bilibili\.com\/video\//,
      /^https?:\/\/www\.bilibili\.com\/bangumi\/play\//,
      /^https?:\/\/www\.bilibili\.com\/cheese\//,
      /^https?:\/\/www\.bilibili\.com\/festival\//,
      /^https?:\/\/www\.bilibili\.com\/list\//,
      /^https?:\/\/www\.bilibili\.com\/medialist\/play\//,
    ],
    options: {
      enableDanmaku: {
        defaultValue: true,
        displayName: '自动开启弹幕',
      },
      enableSubtitle: {
        defaultValue: true,
        displayName: '自动开启 CC 字幕',
      },
      subtitleLanguage: {
        defaultValue: languageDropdownItems[1],
        displayName: '字幕语言偏好',
        dropdownEnum: languageDropdownItems,
      },
      showTip: {
        defaultValue: false,
        displayName: '应用成功后显示提示',
      },
    },
    entry: async context => {
      lastEntryContext = context
      engine = createEngine(context.settings, context.coreApis)
      engine.setup()
    },
    reload: () => {
      if (engine || !lastEntryContext) {
        return
      }
      // 组件被关闭再重新开启时 entry 不会重新执行, 这里重建触发器
      engine = createEngine(lastEntryContext.settings, lastEntryContext.coreApis)
      engine.setup()
    },
    unload: () => {
      if (engine) {
        engine.dispose()
        engine = null
      }
    },
  }

  return component
})()
