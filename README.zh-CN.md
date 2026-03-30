# RSS News MCP

[English README](./README.md)

```text
 ____  ____ ____    _   _                     __  __  ____ ____  
|  _ \/ ___/ ___|  | \ | | _____      _____  |  \/  |/ ___|  _ \ 
| |_) \___ \___ \  |  \| |/ _ \ \ /\ / / __| | |\/| | |   | |_) |
|  _ < ___) |__) | | |\  |  __/\ V  V /\__ \ | |  | | |___|  __/ 
|_| \_\____/____/  |_| \_|\___| \_/\_/ |___/ |_|  |_|\____|_|    
                                                                
```

告别信息焦虑，远离标题党；只需一个 `npx` 命令，就能让你的 AI 接入并处理一手新闻来源。

## 在 MCP 中使用

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

如果你希望把 SQLite 数据库存放到自定义位置：

```json
{
  "mcpServers": {
    "rss-news": {
      "command": "npx",
      "args": ["-y", "@max1ab/rss-news"],
      "env": {
        "RSS_MCP_DB_PATH": "/ABSOLUTE/PATH/rss-news/data/rss.sqlite"
      }
    }
  }
}
```

## 为什么适合给 AI 接新闻

很多 AI 工作流依赖搜索结果、二手摘要，或者被重复内容和标题党干扰的信息流。`@max1ab/rss-news` 更像是给 MCP 客户端加了一层稳定的信息输入层：直接接 RSS/Atom 源、按增量返回、并且记住哪些内容已经看过。

它特别适合这些场景：

- 让 AI 持续跟踪一组固定新闻源
- 同时处理多个 feed，但不想手动去重
- 每次运行都优先拿到新增内容，而不是旧内容重刷
- 用本地 SQLite 保存一份可迁移、可排查的新闻历史

## 你的 AI 可以用它做什么

- 拉取 RSS/Atom 内容并写入本地 SQLite
- 从多个 feed 中整理出一份统一的最新内容列表
- 自动记录哪些内容已经投递过，减少重复读取
- 统计最近一段时间的新闻数量，方便做监控或调度
- 按日期区间批量调整已读或未读状态
- 同时支持普通 RSS 地址和 `rsshub://...` 来源

典型使用流程很简单：

1. 先刷新 feed
2. 再读取最新且尚未投递的内容
3. 由服务自动记录本次已投递的状态

## 增量投递模型

- 数据库文件会在首次使用时按需创建
- `entries` 用来存储抓取到的新闻条目，`feed_url + entry_uid` 保持唯一
- `deliveries` 用来记录哪些条目已经返回给 Agent
- 默认情况下，只会返回还没进入 `deliveries` 的内容，并在返回后自动标记为已投递

## 进阶使用

### 环境变量

- `RSS_MCP_DB_PATH`：SQLite 路径，默认是 `<project-root>/data/rss.sqlite`
- `RSS_MCP_REQUEST_TIMEOUT_MS`：抓取超时时间，默认 `15000`
- `RSS_MCP_DEFAULT_LIMIT_PER_FEED`：每个源的默认返回上限，默认 `20`
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
