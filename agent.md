# CADAM Agent Guide

本文档用于指导在本仓库内工作的开发代理。目标是让修改尽量贴合现有架构，避免破坏 CAD 生成、聊天流、Supabase 数据和 OpenSCAD 编译链路。

## 项目定位

CADAM 是一个开源的 Text-to-CAD Web 应用。用户通过自然语言、参考图或已有 mesh 发起请求，系统生成可预览、可调参、可导出的 3D 模型。

当前项目主要包含两条生成路径：

- Parametric 模式：面向尺寸明确、可调参数、硬件零件类 CAD。LLM 生成 OpenSCAD 代码和参数，浏览器内 OpenSCAD WASM 编译预览。
- Creative 模式：面向更自由的 3D mesh 生成。后端工具链生成 mesh、预览图和可下载文件。

## 技术栈

- 前端：React 19、TypeScript、Vite、React Router、React Query。
- UI：Tailwind CSS、shadcn/ui、Radix UI、lucide-react。
- 3D：Three.js、React Three Fiber、OpenSCAD WASM。
- 后端：Supabase PostgreSQL、Storage、Auth、Edge Functions。
- AI 服务：OpenRouter、Anthropic、Fal/mesh 相关生成服务。
- 监控与分析：Sentry、PostHog。

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm run lint:supabase
```

本地完整开发通常还需要：

```bash
npx supabase start
npx supabase functions serve --no-verify-jwt
```

本地环境变量参见 README：

- `.env.local`
- `supabase/functions/.env`

## 关键目录

- `src/main.tsx`：路由、Sentry、PostHog 和应用入口。
- `src/App.tsx`：全局 Provider 组合。
- `src/views/`：页面级视图，包含 prompt、editor、history、settings、share 等。
- `src/components/`：业务组件和 shadcn/ui 组件。
- `src/services/`：React Query hooks，封装会话、消息、profile、订阅等数据操作。
- `src/contexts/`：当前会话、当前消息、选中素材、auth、mesh 文件等共享状态。
- `src/hooks/`：OpenSCAD、mesh/image 数据、加载进度、媒体查询等可复用逻辑。
- `src/worker/`：浏览器 worker 和 OpenSCAD WASM 调用逻辑。
- `src/vendor/openscad-wasm/`：vendored OpenSCAD WASM 运行时，谨慎改动。
- `shared/`：前后端共用类型、数据库类型、树结构。
- `supabase/functions/`：Edge Functions，包含 parametric/creative chat、mesh、billing、title 等。
- `supabase/schemas/` 和 `supabase/migrations/`：数据库结构与迁移。
- `public/libraries/`：OpenSCAD 库资源，如 BOSL、BOSL2、MCAD。

## 核心数据流

1. 用户在 `PromptView` 或 editor 内提交内容。
2. `useSendContentMutation` 先上传/登记 image 或 mesh，再插入 user message。
3. 根据 `conversation.type` 调用：
   - `parametric-chat`
   - `creative-chat`
4. Edge Function 读取会话消息树、格式化上下文、调用模型或工具。
5. 后端以 newline-delimited JSON 形式流式返回 assistant message。
6. 前端在 React Query cache 中增量更新 messages 和 conversation leaf。
7. Parametric 结果中的 OpenSCAD artifact 交给 `useOpenSCAD`，由 worker 编译为 STL/OFF/SVG 预览。
8. UI 使用 viewer 组件展示模型、图片、参数和下载操作。

## 编码约定

- 优先沿用现有 React Query mutation/query 模式，不新增平行状态系统。
- 新增服务逻辑时优先放在 `src/services/`；只属于某个页面的 UI 状态留在 view/component 内。
- 数据结构优先使用 `shared/types.ts` 和 `shared/database.ts` 中的类型。
- 不要绕过 Supabase RLS/鉴权假设；客户端查询通常需要按 `user_id` 或 conversation id 限定。
- 修改 Edge Functions 时留意 Deno 环境、导入格式和 `supabase/functions/deno.json`。
- 修改 OpenSCAD worker 时要考虑浏览器 worker、WASM 文件系统、字体、库文件和二进制输出。
- UI 组件优先复用 `src/components/ui/` 和已有业务组件。
- 样式优先使用 Tailwind utility 和既有 `adam-*` 主题 token。
- 图标优先使用 `lucide-react` 或已有 icon 组件。

## 生成链路注意事项

- Parametric 模式的产物应包含 OpenSCAD code、参数定义、标题和版本信息。
- 参数类型需要与 `shared/types.ts` 中的 `ParameterType` 对齐。
- 用户上传 mesh 时，parametric 上下文可能包含 bounding box、文件名和渲染视图，生成代码应使用 `import(...)`。
- OpenSCAD 编译可能输出 STL、OFF 或 SVG；OFF 用于保留颜色信息。
- 不要轻易移除 `--backend=manifold`、`--enable=lazy-union` 等 OpenSCAD 参数，除非验证过兼容性。
- 流式响应解析依赖每行一个 JSON message；后端变更响应格式时必须同步前端 reader。

## 数据与账单注意事项

- 聊天生成会消耗 token，Edge Functions 中有 billing 检查。
- `messages` 是树形会话的一部分，`parent_message_id` 和 `current_message_leaf_id` 决定当前分支。
- 图片和 mesh 通常同时有数据库记录和 Storage 对象。
- 更新 conversation 时要同步或失效相关 query key：
  - `['conversation', id]`
  - `['messages', id]`
  - `['conversations']`
  - `['conversations', 'recent']`

## 测试与验证

改动后按影响范围验证：

- TypeScript 或共享类型：运行 `npm run typecheck`。
- 前端组件、hooks、services：运行 `npm run lint` 和 `npm run typecheck`。
- Supabase Edge Functions：运行 `npm run lint:supabase`。
- OpenSCAD 或 viewer 相关：手动启动 dev server，创建或打开模型，确认预览、参数、下载可用。
- 流式聊天相关：至少验证正常返回、错误返回、断流或无 final message 的表现。

## 变更边界

- 不要顺手重构 vendored WASM、生成库 zip、数据库迁移历史或无关 UI。
- 不要改变路由 basename `/cadam`，除非部署策略同步调整。
- 不要提交真实 API key、Supabase service role key、ngrok URL 或用户数据。
- 对 schema、billing、auth、storage policy 的修改要特别保守，并补充迁移或文档。

## 推荐工作方式

1. 先读相关 view、service、shared type 和 Edge Function。
2. 明确这次改动属于 parametric、creative、billing、auth、viewer 还是通用 UI。
3. 保持修改集中，优先补齐现有链路，而不是新建重复链路。
4. 修改后运行最小但有效的验证命令。
5. 在最终说明中写清楚改了哪些文件、验证了什么、还有哪些风险。
