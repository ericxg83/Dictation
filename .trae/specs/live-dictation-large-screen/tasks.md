# Tasks

- [x] Task 1: 服务端统一题目序列生成
  - [x] 修改 `POST /api/live/start`：从题库中随机抽取 count 条，Fisher-Yates 洗牌后存入 `liveBoards[cls.id].sequence`
  - [x] 修改 `GET /api/live/practice`：返回 session 中的统一序列（而非学生自行随机抽取）
  - [x] 修改 `GET /api/live/board`：返回 sequence 信息供大屏展示

- [x] Task 2: 学生端使用统一题目序列
  - [x] 修改 `startPractice()` 逻辑：当 `_liveBank` 存在时，调用 `/api/live/practice` 获取服务端序列
  - [x] 确保序列获取失败时优雅降级（回退本地随机抽取）
  - [x] 修改 `/api/live/practice` 返回结构：`{ bank, entries, sequence }` 中 `entries` 即为排序后的题目列表

- [x] Task 3: 大屏竞技场 HTML 结构重构
  - [x] 重写 `#view-live` 内部结构：竞技场顶部横幅 + 4×2 固定网格 + 底部状态栏
  - [x] 添加「虚位以待」占位卡片模板
  - [x] 添加「时间到」横幅元素
  - [x] 添加倒计时红色警报 CSS 变量标记

- [x] Task 4: 大屏竞技场 CSS 样式
  - [x] 4×2 固定网格布局（`grid-template: repeat(2, 1fr) / repeat(4, 1fr)`）
  - [x] 占位卡片样式：半透明、虚线边框、龙蛋图标居中
  - [x] 红色警报：时钟脉冲动画、背景呼吸光晕、卡片警告边框
  - [x] 排名切换过渡动画（CSS transition on `order` 或 `transform`）
  - [x] 宠物状态动画：开心（弹跳+星星）、沮丧（抖动+灰）、庆祝（旋转+纸屑）
  - [x] 竞技场顶部横幅与底部状态栏样式
  - [x] 全屏适配：`#view-live:fullscreen` 下网格高度撑满

- [x] Task 5: 大屏竞技场 JS 渲染逻辑
  - [x] 重写 `renderLiveGrid()`：4×2 固定布局 + 占位填充 + 前 8 名截取
  - [x] 实现排名变化检测与平滑过渡
  - [x] 实现宠物状态联动（根据 `locked` / `done` / 最新正确/错误变化切换表情）
  - [x] 实现倒计时红色警报（最后 60 秒触发 CSS class）
  - [x] 实现「时间到」横幅显示
  - [x] 修改 `#liveStartBtn` 点击后自动全屏
  - [x] 重写 `renderLiveStats()` 适配新布局

- [x] Task 6: 全屏与退出全屏体验
  - [x] 开始默写自动 `requestFullscreen()`
  - [x] 全屏模式下 ESC 或点击「退出全屏」按钮退出
  - [x] 退出全屏后停止自动全屏（不再重复触发）
  - [x] 老师点击「结束默写」时自动退出全屏

# Task Dependencies
- Task 2 依赖 Task 1（学生端需要服务端先提供序列 API）
- Task 5 依赖 Task 3、Task 4（JS 渲染需要 HTML 结构和 CSS 就绪）
- Task 3、Task 4 可并行开发
- Task 6 依赖 Task 5（全屏触发在渲染逻辑中）