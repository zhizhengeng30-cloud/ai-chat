import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.OPENAI_API_KEY || '';
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    baseUrl: BASE_URL,
    keyConfigured: Boolean(API_KEY),
  });
});

// 流式聊天代理：前端 POST /api/chat { messages: [{role, content}] }
// 后端把 OpenAI 兼容接口的 SSE 流原样转发给前端。
app.post('/api/chat', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: '服务器未配置 OPENAI_API_KEY。请在项目根目录创建 .env 文件并填入你的 API 密钥。',
    });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'messages 不能为空' });
  }

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `上游 API 返回错误 (${upstream.status}): ${errText.slice(0, 500)}`,
      });
    }

    // SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // 把上游的 SSE 字节流原样透传给前端
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: `请求 AI 服务失败: ${err.message}` });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`AI Chat 服务器已启动: http://localhost:${PORT}`);
  console.log(`模型: ${MODEL}  接口: ${BASE_URL}`);
  if (!API_KEY) {
    console.warn('警告: 尚未配置 OPENAI_API_KEY，请在 .env 中填入。');
  }
});
