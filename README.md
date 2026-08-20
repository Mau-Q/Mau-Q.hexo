# Mau-Q Hexo Blog

源码工程，生成输出到 [`Mau-Q.github.io`](https://mau-q.github.io)。

## 常用命令

```bash
# 本地预览
npm run server          # http://localhost:4000

# 新建文章
npx hexo new "文章标题"

# 新建生活随笔
npx hexo new life "文章标题"

# 新建技术文章（建议先用英文 slug，再把 front matter 的 title 改成中文标题）
npx hexo new tech "git-reset-reflog"

# 从 Obsidian 的 Blogs 文件夹同步可发布文章
npm run blog:sync

# 只检查会同步哪些文章，不写入 Hexo
npm run blog:sync:check

# 预览 Obsidian 文章会补哪些固定网址名
npm run blog:slug:check

# 自动把固定网址名写回 Obsidian front matter
npm run blog:slug:fix

# 最终验收：产物、外链、隐私/草稿词、Obsidian 残留语法
npm run blog:doctor

# 一键检查 Obsidian 博客文章，不写入发布产物
npm run blog:check

# 同步 Obsidian 文章后构建
npm run blog:build

# 一键准备发布：补 slug、同步 ready 文章、构建
npm run blog:ready

# 本地构建 + 同步到发布目录
npm run publish:local

# 仅构建
npm run build

# 只为已经生成的 public/ 建立中文全文搜索索引
npm run search:index

# 脚本语法与同步流程测试
npm run check:syntax
npm test
```

## 项目结构

| 文件/目录 | 说明 |
|-----------|------|
| `_config.yml` | Hexo 站点配置 |
| `_config.a4.yml` | A4 主题配置 |
| `source/_posts/` | 文章 Markdown |
| `source/index/index.md` | 首页内容 |
| `source/categories/index.md` | 分类入口 |
| `scaffolds/life.md` | 生活随笔模板 |
| `scaffolds/tech.md` | 技术文章模板 |
| `obsidian-blog.config.json` | Obsidian 博客同步配置 |
| `obsidian-blog.manifest.json` | 已生成文章和图片清单，用于安全清理取消发布内容 |
| `blog-slug-dictionary.json` | 自动生成 slug 的中文技术词典 |
| `tools/sync-obsidian-blogs.js` | Obsidian `Blogs/` 到 Hexo 的同步脚本 |
| `tools/blog-doctor.js` | 发布前最终验收脚本 |
| `tools/font-subsets.js` | 根据站点文本生成霞鹜文楷常规体、粗体子集 |
| `tools/seasonal-poems.js` | 生成 2020—2100 年二十四节气日期表 |
| `tools/post-afterword.js` | 按文章分类、标签稳定选择文章余韵 |
| `scripts/theme-patch.js` | 构建时覆盖 A4 主题模板、清理无用主题产物 |
| `scripts/font-subsets.js` | 构建时用字体子集替换主题的完整字体 |
| `scripts/poem-shards.js` | 构建时把诗词库拆成 10 片（`/data/poems/0-9.json`） |
| `resources/seasonal-poems.json` | 二十四节气当天使用的诗句 |
| `resources/post-afterwords.json` | 文章余韵的分类、标签规则与诗句 |
| `source/css/custom.css` | 自定义 CSS（字体、代码块等） |
| `resources/poems.json` | 首页本地诗词库源数据（1000 条，构建时分片，不直接发布） |
| `source/js/randomPoem.js` | 首页随机诗词加载逻辑（随机取一个分片，约 15K） |
| `source/js/toc.js` | 文章左侧目录（原生 JS，覆盖主题的 jQuery/tocify 实现） |
| `source/js/returnToTop.js` | 回到顶部按钮（原生 JS 覆盖版） |
| `source/js/returnToLastPage.js` | 回退按钮（原生 JS 覆盖版） |
| `source/search/index.md` | Pagefind 站内搜索页面 |
| `layout-overrides/index.ejs` | 首页“关于、精选、最近文章”信息层级 |
| `layout-overrides/list.ejs` | 带摘要、分类和标签的文章归档列表 |
| `tools/og-images.js` | 使用本地霞鹜文楷生成中文 PNG 分享卡片 |
| `scripts/og-images.js` | 构建时把站点及文章分享卡片注入 Hexo 路由 |
| `source/robots.txt` | SEO robots 配置 |
| `.github/workflows/deploy.yml` | 自动部署 |

## 部署方式

### 方式一：手动（当前可用）

```bash
npm run publish:local
```

这会在本地构建并 rsync 到 `../Mau-Q.github.io/`，然后手动 git commit + push。

### 方式二：GitHub Actions（当前推荐）

1. 将本项目 push 到 GitHub 新仓库（如 `Mau-Q/blog-source`）
2. 在 GitHub 创建 [Personal Access Token](https://github.com/settings/tokens)（勾选 `repo` 权限）
3. 在源码仓库 Settings → Secrets 中添加 `DEPLOY_TOKEN`，值为上一步的 token
4. 之后每次 push 源码，GitHub Actions 会先运行语法检查、测试、构建和 doctor，再部署到 `Mau-Q.github.io`

## 已知事项

- 当前博客采用“生活 + 技术”共用一个站点的结构：
  - 生活随笔使用 `npx hexo new life "文章标题"`，默认分类为 `生活`。
  - 技术文章使用 `npx hexo new tech "english-slug"`，默认分类为 `技术`；如果想要更干净的 URL，建议文件名用英文 slug，再把文章 front matter 的 `title` 改成中文标题。
  - 顶部菜单的 `分类` 页面会自动聚合 `生活`、`技术` 等分类。
- 搜索、首页和分享体验：
  - `npm run build` 会在 Hexo 生成完成后运行 Pagefind，为带有 `data-pagefind-body` 的文章正文建立中文分词索引。
  - `/search/` 使用 Pagefind 的本地 Web Component；查询只在浏览器内完成，不依赖搜索服务。
  - 从搜索结果进入文章时，`source/js/pagefind-highlight.js` 会按需加载 Pagefind 高亮模块；普通页面不会加载该模块。
  - 首页自动选择最新一篇文章作为“精选”，其余文章进入“最近文章”；数量在 `_config.a4.yml` 的 `experience.home` 中集中配置。
  - `/list/` 按年份展示文章日期、分类、摘要和标签，摘要长度由 `experience.list.excerptLength` 控制。
  - 构建时会在 `.cache/og-images/` 生成 1200×630 PNG，并发布到 `/img/og/`；文章可用 front matter 的 `og_image` 覆盖自动卡片。
  - 分享卡片使用主题自带的本地霞鹜文楷完整字体渲染，避免 CI/Linux 环境缺少中文字体。
  - Pagefind 与分享卡片都是构建产物；直接运行 `npm run server` 前若未执行过构建，搜索页不会有可用索引。
- Obsidian 写作入口为 `/Users/rui/Documents/rui/Blogs`：
  - 只有 `blog: true` 且 `status: ready` 的 Markdown 会被同步。
  - 建议从 `/Users/rui/Documents/rui/Blogs/_template.md` 复制模板开始写。
  - 也可以从 `/Users/rui/Documents/rui/Blogs/_templates/tech.md` 或 `/Users/rui/Documents/rui/Blogs/_templates/life.md` 复制对应模板。
  - `slug` 可选；不写时会自动从英文文件名、标题里的英文技术词和本地技术词典生成网址名。
  - 例如标题 `数据库恢复中的 UNDO、REDO 与检查点` 会生成类似 `database-recovery-undo-redo-checkpoint`。
  - 需要补充 slug 词汇时，直接编辑 `blog-slug-dictionary.json`，例如添加 `"并查集": "union find"`。
  - 如果标题无法生成可读网址，会自动使用 `post-日期-短hash` 兜底。
  - 推荐在发布前运行 `npm run blog:slug:check` 预览，再运行 `npm run blog:slug:fix` 自动写回固定 `slug`。
  - 自动写回后，后续同步会一直使用这个固定网址；如果想强制指定，也可以手动改成 `slug: git-reset-reflog`。
  - `![[图片.png]]` 会复制到 `source/img/blogs/<文章网址名>/` 并改成普通 Markdown 图片。
  - `[[内部链接]]` 会优先转成已发布文章链接；找不到对应发布文章时，只保留显示文字。
  - 日常推荐流程：先运行 `npm run blog:check` 预览，再运行 `npm run blog:ready` 准备发布。
  - `npm run blog:doctor` 会检查生成产物、远程外链、未处理的 Obsidian 语法、本地路径和常见隐私/草稿词。
  - 同步清单只管理由该工具生成的文章和图片；文章取消 `ready` 后，相应生成文件会在下一次同步时安全移除。
  - `npm run blog:ready` 不会自动 commit 或 push，确认本地效果后再手动发布。

- `scripts/theme-patch.js` 会在 Hexo 生成前用 `layout-overrides/` 覆盖 A4 主题模板：
  - `layout-overrides/layout.ejs`
  - `layout-overrides/_partial/head.ejs`
  - `layout-overrides/_partial/footer.ejs`
- 升级 `hexo-theme-a4` 后，需要对比 `node_modules/hexo-theme-a4/layout/` 中的原始模板与 `layout-overrides/` 文件，确认新版主题结构没有变化，再重新构建。
- `source/css/unicons.css` 是对主题同名文件的本地覆盖，用于移除远程字体 fallback；升级主题后也需要与 `node_modules/hexo-theme-a4/source/css/unicons.css` 对比。
- 站点已完全去 jQuery：`source/js/toc.js`、`returnToTop.js`、`returnToLastPage.js` 是对主题同名文件的原生 JS 覆盖；升级主题后需确认这三个文件的行为仍与主题版本等价。
- 暗黑模式的 `darkreader.min.js`（88K）按需加载：浅色模式用户不会下载；跟随系统或手动切换到暗色时才加载。
- 首页诗词库在构建时由 `scripts/poem-shards.js` 拆成 10 片，首页每次只请求一片；分片数量改动时需同步修改 `source/js/randomPoem.js` 中的 `SHARD_COUNT`。
- 首页平时继续从本地诗词库随机取句；二十四节气当天会按北京时间自动替换为 `resources/seasonal-poems.json` 中的对应诗句。
- 每篇文章末尾会按分类和标签从 `resources/post-afterwords.json` 选择固定的“文章余韵”；front matter 可用 `afterword: false` 关闭，或用 `afterword: 自定义诗句` 覆盖。
- `_config.yml` 使用 `updated_option: date` 保证不同机器构建结果一致；需要显示修改日期时，在文章 front matter 中显式填写 `updated`。
- 字体仍使用本地霞鹜文楷 Lite 常规体和粗体，但构建时会扫描页面、文章、配置及完整诗词库并自动生成子集；新文章中的新字符会在下一次构建自动加入。
- 无图片画廊时不会发布或加载 LightGallery；评论关闭时不会发布 Waline 资源。
- 首页诗词数据来自 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，运行时只读取本地分片数据，不调用远程接口。
