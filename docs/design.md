# Text/Image to CAD Generation Design

本文档只关注一件事：用户把 text 或 image 发出后，CADAM 如何生成一套完整的 parametric CAD 模型。这里不讨论页面 UI 设计。

## 总体目标

CADAM 的 parametric 生成链路不是简单返回一段 3D 文本，而是把用户意图转成一个可继续编辑的 CAD artifact：

- OpenSCAD 源码
- 可调参数列表
- 模型标题
- 版本号
- 可流式展示的生成状态
- 可被后续消息继续修改的会话上下文

最终产物保存在 assistant message 的 `content.artifact` 中：

```ts
type ParametricArtifact = {
  title: string;
  version: string;
  code: string;
  parameters: Parameter[];
  suggestions?: string[];
};
```

## 输入类型

用户输入统一进入 `Content`：

```ts
type Content = {
  text?: string;
  images?: string[];
  mesh?: Mesh;
  error?: string;
  artifact?: ParametricArtifact;
  meshBoundingBox?: { x: number; y: number; z: number };
  meshFilename?: string;
};
```

当前生成 CAD 模型时主要处理三类输入：

- Text：用户直接描述要做什么，例如 “make a phone stand”。
- Image：用户上传参考图，模型会根据图片视觉信息生成或修改 CAD。
- Mesh：用户上传已有 STL，系统要求模型在 OpenSCAD 中 `import("filename.stl")`，并围绕原模型添加或裁剪结构。

## 端到端流程

```text
User text/image/mesh
  -> useSendContentMutation
  -> register image/mesh records
  -> insert user message
  -> call parametric-chat Edge Function
  -> load message tree and current branch
  -> format text/images/mesh context
  -> outer agent decides action
  -> build_parametric_model tool
  -> strict code generation call
  -> stream partial OpenSCAD artifact
  -> parse parameters
  -> save final assistant message
  -> browser OpenSCAD worker compiles preview
```

关键实现位置：

- Client submit：`src/services/messageService.ts`
- Parametric Edge Function：`supabase/functions/parametric-chat/index.ts`
- User context formatting：`supabase/functions/_shared/messageUtils.ts`
- Parameter extraction：`supabase/functions/_shared/parseParameter.ts`
- OpenSCAD compile：`src/hooks/useOpenSCAD.ts`、`src/worker/openSCAD.ts`
- Shared contract：`shared/types.ts`

## 1. 客户端提交阶段

用户提交内容后，`useSendContentMutation` 负责把输入转成一次后端生成请求。

它做四件事：

1. 如果有 images，把 image id 写入 `images` 表，并绑定 `conversation_id`、`user_id`。
2. 如果有 mesh，把 mesh id 写入 `meshes` 表，并绑定 `conversation_id`、`user_id`、`file_type`。
3. 插入一条 user message，`content` 中保存 text/images/mesh 等输入。
4. 根据 `conversation.type` 调用 `parametric-chat` 或 `creative-chat`。

本文关注 parametric CAD，所以后续进入 `parametric-chat`。

## 2. 后端请求初始化

`parametric-chat` 收到请求后先做基础校验：

1. 处理 CORS 和 POST method。
2. 用请求里的 Authorization header 创建 Supabase client。
3. 通过 `supabase.auth.getUser()` 校验用户。
4. 扣除基础 chat token。
5. 读取请求体：

```ts
{
  messageId,
  conversationId,
  model,
  newMessageId,
  thinking
}
```

然后从 `messages` 表读取当前 conversation 的所有消息，并插入一条 placeholder assistant message：

```ts
content = { model };
```

这条 placeholder message 会在生成过程中不断更新，并通过流式响应发回客户端。

## 3. 会话分支与上下文构造

CADAM 的消息是树形结构，不是简单线性历史。

后端会：

1. 用所有 messages 构造 `Tree<Message>`。
2. 找到本次用户 message。
3. 通过 `messageTree.getPath(newMessage.id)` 得到当前分支。
4. 只把当前分支发给模型，避免重试或编辑旧消息时混入无关分支。

每条 message 会被格式化成模型可理解的上下文。

### Text 输入

用户文本直接作为 text block 进入模型上下文。

如果用户消息包含 `error`，会附加修复指令：

```text
The OpenSCAD code generated has failed to compile...
fix any syntax, logic, parameter, library, or other issues
```

这让用户可以把 OpenSCAD 编译错误重新发给模型，触发修复。

### Image 输入

用户上传图片后，message 中保存的是 image id。后端会：

1. 根据 `userId/conversationId/imageId` 计算 Storage path。
2. 从 Supabase Storage 下载图片。
3. 转成 base64 data URL。
4. 以 vision block 形式发给模型。

这样模型不是只看到图片 id，而是实际看到图片内容。

### Mesh 输入

如果用户上传 STL，并且已有 bounding box 信息，后端会构造强约束说明：

- 模型文件名。
- 宽、高、深。
- 模型中心在原点。
- 顶部、底部 Z 坐标。
- 必须使用 `import("filename")`。
- 如何在模型上方、下方、周围放置新结构。
- 建议使用 rotation 参数让用户微调方向。

这能避免模型重新“想象”一个 STL，而是基于用户上传的真实模型做 CAD 修改。

## 4. 双阶段模型调用

Parametric 生成分成两个模型调用阶段。

### 第一阶段：Outer Agent

第一阶段使用 `PARAMETRIC_AGENT_PROMPT`。它的目标不是直接写完整 OpenSCAD，而是判断用户意图并选择工具。

可选工具：

- `build_parametric_model`
- `apply_parameter_changes`

选择规则：

- 新模型或结构性修改：调用 `build_parametric_model`。
- 简单参数调整，例如 “height to 80”：调用 `apply_parameter_changes`。

这样可以避免每次简单改参数都重新生成整套 CAD 代码。

### 第二阶段：Strict Code Generation

当 outer agent 调用 `build_parametric_model` 时，后端会再发起一次更严格的 code generation 调用。

这一阶段使用 `STRICT_CODE_PROMPT`，核心要求是：

- 只返回 raw OpenSCAD code。
- 不要 markdown code fence。
- 不要解释性文本。
- 所有模型必须是 3D printable。
- 结构应尽量 manifold。
- 变量必须放在代码开头。
- 参数名使用完整、可读的 snake_case。
- 参数会直接显示给用户，所以不能用 `w`、`h` 这种短名。
- 不同部件尽量用 `color()` 区分。
- 颜色也暴露成 `*_color` 字符串参数。
- 如果是用户上传 STL，必须 `import()` 原模型，不要重建它。

第二阶段生成时会流式读取 OpenRouter SSE。后端把 partial code 逐步写入：

```ts
content.artifact = {
  title: 'Adam Object',
  version: 'v1',
  code: streamed,
  parameters: []
};
```

这样客户端在最终完成前也能看到生成中的 artifact。

## 5. 标题生成

生成 OpenSCAD 的同时，后端并行调用 `generateTitleFromMessages()`。

标题要求：

- 简短。
- 只描述对象名。
- 最长约 25 个字符。
- 去除 quotes、`Title:` 前缀、解释性尾巴。

如果标题异常，会 fallback 到 `Adam Object`。

## 6. 参数解析

OpenSCAD 代码生成完成后，后端调用 `parseParameters(code)`。

解析策略：

1. 只扫描文件顶部，遇到第一个 `module` 或 `function` 前停止。
2. 匹配形如：

```openscad
cup_height = 100; // 20:1:200
body_color = "#4682B4";
use_handle = true;
```

3. 根据值推断参数类型：

- `number`
- `boolean`
- `string`
- `number[]`
- `string[]`
- `boolean[]`

4. 根据注释解析 range、step 或 options。
5. 根据上方注释解析 description。
6. 根据 `/* [Group Name] */` 解析参数分组。

最后形成：

```ts
type Parameter = {
  name: string;
  displayName: string;
  value: string | boolean | number | string[] | number[] | boolean[];
  defaultValue: string | boolean | number | string[] | number[] | boolean[];
  type?: ParameterType;
  description?: string;
  group?: string;
  range?: ParameterRange;
  options?: ParameterOption[];
};
```

这一步让模型不只是“生成代码”，还生成一套可被程序控制的 CAD 参数系统。

## 7. 保存最终 Artifact

当 code、title、parameters 都准备好后，assistant message 的最终 content 变成：

```ts
content = {
  model,
  text,
  artifact: {
    title,
    version: 'v1',
    code,
    parameters: parseParameters(code)
  }
};
```

后端会：

1. 移除完成的 tool call。
2. 更新 `messages` 表中 placeholder assistant message。
3. 向客户端 stream final message。
4. 关闭响应流。

前端收到 final message 后，React Query cache 中的 conversation/messages 就拥有完整 CAD artifact。

## 8. 参数修改链路

如果用户只是说 “make it taller” 或 “height to 80”，outer agent 可以调用 `apply_parameter_changes`。

这条链路不会重新生成完整 OpenSCAD。

后端会：

1. 找到当前 artifact code。
2. 用 `parseParameters(baseCode)` 得到现有参数。
3. 按参数类型把新值转成 number、boolean 或 string。
4. 用正则只替换顶部参数赋值。
5. 重新解析参数。
6. 保存新的 artifact。

这种设计的好处：

- 快。
- 稳定。
- 不容易破坏模型结构。
- 保留用户当前模型代码。

## 9. 编译与模型成形

生成完成后，OpenSCAD code 会交给浏览器里的 worker 编译。

`useOpenSCAD` 负责：

- 创建 worker。
- 向 worker 写入用户上传文件。
- 发送 preview/export 编译请求。
- 接收 STL/OFF/SVG 输出。
- 管理 compiling 和 error 状态。

`OpenSCADWrapper` 负责：

- 初始化 OpenSCAD WASM。
- 写入字体配置和 Geist 字体。
- 写入 workspace files。
- 调用 OpenSCAD export。
- 对 3D 模型输出 STL 和 OFF。
- 如果不是 3D object，尝试 fallback 到 SVG。

预览编译时会加上：

```text
--backend=manifold
--enable=lazy-union
--enable=roof
```

OFF 输出用于保留 OpenSCAD `color()` 的面颜色；STL 用于下载或通用 3D 预览。

## 10. 完整 CAD 模型的组成

在 CADAM 中，一套“完整 CAD 模型”实际由几部分组成：

### 1. 几何定义

OpenSCAD code 中的 primitives、boolean operations、transforms 和 modules。

常见结构：

```openscad
union() {
  difference() {
    cylinder(...);
    translate(...) cylinder(...);
  }
  translate(...) cube(...);
}
```

### 2. 参数层

文件顶部的变量声明：

```openscad
cup_height = 100;
cup_radius = 40;
wall_thickness = 3;
body_color = "#4682B4";
```

这些变量会被解析成程序可控制参数，也会在后续参数修改时被精准替换。

### 3. 可打印约束

Prompt 要求模型：

- 部件连接成整体。
- 避免非 manifold 结构。
- 使用合理 wall thickness。
- 使用 boolean operations 形成孔、槽、空腔。
- 对上传 STL 使用 `import()` 并围绕原模型修改。

### 4. 视觉表达

对不同部件用 `color()` 包裹，帮助预览理解结构：

```openscad
color(body_color) cylinder(...);
color(handle_color) translate(...) ...
```

颜色也是参数，因此仍属于 CAD artifact 的可调部分。

### 5. 可持续编辑上下文

生成结果不是一次性文件。它作为 assistant message 留在 conversation tree 中，后续用户可以：

- 改参数。
- 追加结构。
- 根据编译错误修复。
- 基于图片或 mesh 继续修改。
- 从历史分支重试。

## 失败与兜底

系统有几层兜底：

- OpenRouter stream chunk 解析失败时跳过坏 chunk，不立即中断。
- 如果模型没有调用工具但直接输出了 OpenSCAD，后端会尝试从文本中提取代码。
- 如果 code generation 失败但已有 partial artifact，会保留 partial code 并标记 tool call error。
- 如果没有任何 text、tool call 或 artifact，会保存一条 retry hint，避免空消息。
- 编译错误可作为下一轮 user content.error 传回模型修复。

## 核心设计判断

这套链路的关键不是“让模型直接回答 CAD”，而是把生成拆成可控步骤：

1. 用户输入持久化。
2. 当前会话分支恢复。
3. 图片和 mesh 转成模型可理解的上下文。
4. Outer agent 判断是重建模型还是改参数。
5. Strict code generator 只负责输出 OpenSCAD。
6. 程序解析 OpenSCAD 顶部参数，形成结构化 parameter schema。
7. Artifact 落库，成为后续编辑的基准。
8. 浏览器 worker 用 OpenSCAD WASM 编译成真实几何输出。

因此，text/image 到 CAD 的实现核心是：

```text
Intent + visual context
  -> structured model-generation prompt
  -> OpenSCAD source
  -> parsed parameter schema
  -> persisted artifact
  -> WASM-compiled geometry
```
