# AI Chat 网站

一个类似 ChatGPT 的 AI 对话网站：简洁现代的界面、流式输出、上下文记忆、历史对话、Markdown 渲染、电脑/手机自适应。API 密钥保存在服务器端，不会暴露给浏览器。

## 技术栈

- 后端：Node.js + Express（提供静态页面，并把前端请求流式转发给 AI 模型 API）
- 前端：原生 HTML / CSS / JavaScript（无构建步骤）
- 兼容任何 OpenAI 格式的 API（OpenAI、DeepSeek、Moonshot、通义千问、智谱等）

## 项目结构

```
new-chat/
├── server.js          # 后端：静态服务 + /api/chat 流式代理
├── package.json
├── .env.example       # 配置模板
├── .env               # 你的真实配置（自行创建，不提交 git）
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## 本地启动

### 1. 安装依赖（已执行过可跳过）

```bash
npm install
```

### 2. 配置 API 密钥

把 `.env.example` 复制为 `.env`，填入你自己的配置：

```
OPENAI_API_KEY=sk-你的密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

常用服务商的 `OPENAI_BASE_URL`：

| 服务商 | BASE_URL |
|---|---|
| OpenAI | https://api.openai.com/v1 |
| DeepSeek | https://api.deepseek.com/v1 |
| Moonshot | https://api.moonshot.cn/v1 |
| 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| 智谱 | https://open.bigmodel.cn/api/paas/v4 |

### 3. 启动

```bash
npm start
```

浏览器打开 http://localhost:3000 即可使用。

> 注意：历史对话保存在**浏览器本地**（localStorage），换浏览器/换设备不会同步；AI 密钥只存在服务器的 `.env` 里，前端永远拿不到。

## 部署到互联网

### 方案一：Render（免费额度，最简单，推荐）

1. 把本项目推到一个 GitHub 仓库（`.env` 不要提交，已在 `.gitignore` 中排除）。
2. 登录 https://render.com ，选择 **New → Web Service**，关联你的仓库。
3. 配置：
   - Build Command: `npm install`
   - Start Command: `npm start`
   - 在 **Environment Variables** 里添加 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`（不要用 `.env` 文件）。
4. 部署完成后会得到一个 `https://xxx.onrender.com` 的公网地址。

### 方案二：Railway / Vercel（Node）

Railway：New Project → 关联 GitHub 仓库，自动检测 Node，在 Variables 里配上面三个环境变量即可。

Vercel：导入仓库，在 Settings → Environment Variables 里配置，Build 留空、Output 留空即可。

### 方案三：自己的 VPS（Ubuntu）

```bash
# 1. 安装 Node 18+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. 上传代码后
npm install --production

# 3. 用 pm2 常驻
sudo npm install -g pm2
pm2 start server.js --name ai-chat
pm2 save
```

再用 Nginx 反向代理到 `localhost:3000`，并配置 HTTPS（可用 certbot 免费证书）。

## 常见问题

- **打开后回复"服务器未配置 OPENAI_API_KEY"**：说明 `.env` 没建或没填对，重启 `npm start`。
- **回复 401/403**：API 密钥错误，或该服务商的 `BASE_URL` 填错。
- **手机上看不到历史对话**：点左上角 ☰ 打开侧边栏。
