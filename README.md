# 自动开启弹幕与字幕 (Bilibili-Evolved 组件)

基于 [the1812/Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) 的用户组件（User Component）机制开发，单文件、免构建，直接安装即可使用。

**作者**：[夏幻玉](https://space.bilibili.com/610504174) (Bilibili) · [yss161](https://github.com/yss161) (GitHub)

## 功能

- **自动开启弹幕**：进入视频 / 番剧 / 课程页面时，如果弹幕处于关闭状态，自动帮你打开；切换分 P、连播下一个视频时也会重新应用。
- **自动开启 CC 字幕**：如果视频有 CC 字幕且当前为关闭状态，自动按你设置的**偏好语言**选择字幕轨道并打开。
- 字幕语言偏好支持常见语言下拉选择（中文简体 / 繁體、AI 自动生成、英日韩俄德法等），并带智能回退：例如选了「英语」而视频只有「英语（美式）」时自动匹配。
- 选择的语言在当前视频不存在时**不会误开**其他语言的字幕（可选「自动」模式改为跟随 B 站默认）。
- 字幕已手动开启时不干预，尊重你的手动选择；视频本身没有 CC 字幕时静默跳过。

## 安装

1. 打开 Bilibili-Evolved 的设置面板；
2. 进入 **通用 → 用户组件**（或直接搜索"用户组件"）；
3. 点击**添加**，通过以下任一方式安装：
   - **从 URL 添加**（推荐），粘贴：
     `https://raw.githubusercontent.com/yss161/bilibili-auto-danmaku-subtitle/main/auto-enable-danmaku-subtitle.js`
   - 或**从代码添加**：粘贴 [`auto-enable-danmaku-subtitle.js`](./auto-enable-danmaku-subtitle.js) 的全部内容；
4. 刷新页面，进入任意视频页即可生效。

安装后在设置面板会出现「**自动开启弹幕与字幕**」卡片，可以随时开关本组件或修改选项。

## 选项说明

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| 自动开启弹幕 | 开 | 弹幕完全关闭时自动打开；「精简弹幕」视为已开启，不改动 |
| 自动开启 CC 字幕 | 开 | 视频有字幕且处于关闭状态时自动打开 |
| 字幕语言偏好 | 中文（简体） | 下拉选择，值为显示名 + 语言代码（如 `zh-Hans`）；也可手填语言代码 |
| 应用成功后显示提示 | 关 | 自动开启成功后在屏幕上弹出提示 |

### 字幕语言代码对照

| 显示 | 代码 | 备注 |
| --- | --- | --- |
| 自动（跟随 B 站偏好 / 第一项） | （空） | 选择字幕菜单第一项 |
| 中文（简体） | `zh-Hans` | UP 主上传的正式字幕，多数视频的默认选择 |
| 中文（AI 自动生成） | `ai-zh` | AI 字幕，需要登录账号且视频支持 |
| 中文（繁體） / 中文（香港） / 中文（普通话） | `zh-Hant` / `zh-HK` / `zh-CN` | 部分官方内容提供 |
| 英语 / 英语（AI 自动生成） / 英语（美式） | `en` / `ai-en` / `en-US` | `en` 常见于自动翻译 |
| 日语 / 韩语 / 俄语 / 德语 / 法语 / 西班牙语 等 | `ja` / `ko` / `ru` / `de-DE` / `fr` / `es` | 视具体视频而定 |

> 匹配规则与 Bilibili-Evolved 内置的 `playerAgent.toggleSubtitle` 一致：精确代码 → 同基础语言的非 AI 项 → 同基础语言的 AI 项；指定语言找不到时不会启用字幕（选「自动」则永远启用第一项）。

## 行为细节

- 触发时机：进入/刷新视频页、切换分 P、连播切换视频（SPA 跳转）后自动应用一次，页面内多次触发会自动防抖合并。
- 仅在弹幕/字幕**处于关闭状态**时操作，不会关掉已开启的，也不会和你的手动操作"打架"。
- 视频没有 CC 字幕（播放器无字幕按钮数据）时，静默等待数秒后放弃，不影响正常观看。
- 生效范围：`www.bilibili.com` 的 `/video/`、`/bangumi/play/`、`/cheese/`、`/festival/`、`/list/`、`/medialist/play/` 页面。

## 实现说明

- 控制逻辑复刻自 Bilibili-Evolved 内置播放器代理 [`player-agent`](https://github.com/the1812/Bilibili-Evolved/blob/preview/src/components/video/player-agent/base.ts)：
  - 弹幕开关：`.bpx-player-dm-switch input`（`checked` / `indeterminate` 判断状态，派发 `change` 事件，应用后校验防止被播放器配置覆盖）；
  - 字幕开关：`.bpx-player-ctrl-subtitle-close-switch` 的 `bpx-state-active` 判断字幕是否关闭，通过点击 `.bpx-player-ctrl-subtitle-major .bpx-player-ctrl-subtitle-language-item[data-lan=...]` 选择语言。
- 触发器优先使用核心 `coreApis.observer` 的 `videoChange` / `urlChange`，旧版本核心自动回退到监听同名窗口事件；toast 提示同时兼容新旧核心 API。
- 全部选择器与行为已在真实 B 站视频页实测通过（见下）。

## 已验证（2026-10，Chrome + bpx 播放器）

1. 弹幕关闭状态下进入页面 → 自动打开，弹幕条恢复显示；
2. 字幕关闭 + 偏好「中文（简体）」→ 自动开启并选中 `zh-Hans`；
3. 偏好「日语」→ 自动开启 `ja`（日本語）；
4. 偏好语言视频中不存在（如「法语」）→ 不误开字幕，并提示；
5. 偏好「自动」→ 选择字幕菜单第一项；
6. 模拟切换视频（`videoChange` 事件）→ 弹幕、字幕自动重新应用；
7. 组件卸载（unload）后不再响应任何事件；重新启用（reload）后恢复正常。
