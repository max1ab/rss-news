```text
 ____  ____ ____    _   _                     __  __  ____ ____  
|  _ \/ ___/ ___|  | \ | | _____      _____  |  \/  |/ ___|  _ \ 
| |_) \___ \___ \  |  \| |/ _ \ \ /\ / / __| | |\/| | |   | |_) |
|  _ < ___) |__) | | |\  |  __/\ V  V /\__ \ | |  | | |___|  __/ 
|_| \_\____/____/  |_| \_|\___| \_/\_/ |___/ |_|  |_|\____|_|    
                                                                
```

[![npm-@max1ab/rss-news](https://img.shields.io/badge/npm-%40max1ab%2Frss--news-CB3837)](https://www.npmjs.com/package/@max1ab/rss-news)
[![lang-English](https://img.shields.io/badge/lang-English-blue)](./README.md)

告别信息焦虑，远离标题党；只需一个 `npx` 命令，就能让你的 AI 接入并处理一手新闻来源。

## 安装 MCP

把下面的配置加入你的 MCP 配置文件：

```json
{
  "mcpServers": {
    "rss-news": {
      "command": "npx",
      "args": ["-y", "@max1ab/rss-news"]
    }
  }
}
```

## 例子

你可以直接这样对支持 MCP 的 AI 说：

1. 帮我查看过去 24 小时的新闻，筛选重要内容，总结后整理到 Notion。
2. 帮我查看当前未读新闻，挑出最重要的几条，发送消息到我的手机。
3. 帮我关注 OpenAI 的最新消息，如果还没有订阅相关源，先帮我添加合适的订阅。
4. 帮我搜索一些关于 AI 的 RSS 源，先预览内容质量，再把合适的加到订阅里。
5. 帮我统计过去 24 小时有多少条未读新闻，按来源分别列出来。

## 功能

- 管理订阅
- 同步最新新闻
- 获取未读新闻
- 消费新闻
- 统计
- 重置状态

- 首次创建数据库时自动导入 `example-subscriptions.json` 中的示例订阅源

## 进阶使用

### 环境变量

- `RSS_MCP_DB_PATH`：SQLite 路径，Windows 默认是 `%APPDATA%/rss-news/rss.sqlite`，其他平台默认是 `~/.local/share/rss-news/rss.sqlite`
- `RSS_MCP_REQUEST_TIMEOUT_MS`：抓取超时时间，默认 `15000`
- `RSS_MCP_DEFAULT_FETCH_LIMIT`：默认全局返回上限，默认 `20`
- `RSS_MCP_MAX_FEEDS_PER_REQUEST`：单次请求允许的最大 feed 数量，默认 `50`
- `RSS_MCP_USER_AGENT`：自定义请求 User-Agent
- `RSS_MCP_DEBUG`：设为 `1` 或 `true` 启用调试日志
- `RSS_MCP_DEBUG_PREVIEW_LENGTH`：调试时响应预览长度，默认 `300`

### 本地开发

```bash
npm install
npm run build
npm start
```

开发模式：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

### 当前 Tools

- 数据库文件会在首次使用时按需创建
- `subscriptions` 用来存订阅源及抓取状态
- `entries` 用来存储抓取到的新闻条目，`feed_url + entry_uid` 保持唯一
- `deliveries` 用来记录哪些条目已经被消费

可用 MCP tool：

- `list_subscriptions`
- `upsert_subscriptions`
- `remove_subscriptions`
- `preview_feed`
  在正式订阅前预览一个或多个 feed URL，确认它们可抓取且内容符合预期。
- `sync_news`
- `fetch_news`
- `consume_news`
- `count_news`
- `set_consumption_status`
