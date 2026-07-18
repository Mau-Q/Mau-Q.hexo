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
| `blog-slug-dictionary.json` | 自动生成 slug 的中文技术词典 |
| `tools/sync-obsidian-blogs.js` | Obsidian `Blogs/` 到 Hexo 的同步脚本 |
| `tools/blog-doctor.js` | 发布前最终验收脚本 |
| `source/css/custom.css` | 自定义 CSS（字体、代码块等） |
| `source/data/poems.json` | 首页本地诗词库（1000 条） |
| `source/js/randomPoem.js` | 首页随机诗词加载逻辑 |
| `source/robots.txt` | SEO robots 配置 |
| `.github/workflows/deploy.yml` | 自动部署 |

## 部署方式

### 方式一：手动（当前可用）

```bash
npm run publish:local
```

这会在本地构建并 rsync 到 `../Mau-Q.github.io/`，然后手动 git commit + push。

### 方式二：GitHub Actions（需配置）

1. 将本项目 push 到 GitHub 新仓库（如 `Mau-Q/blog-source`）
2. 在 GitHub 创建 [Personal Access Token](https://github.com/settings/tokens)（勾选 `repo` 权限）
3. 在源码仓库 Settings → Secrets 中添加 `DEPLOY_TOKEN`，值为上一步的 token
4. 之后每次 push 源码，GitHub Actions 自动构建并部署到 `Mau-Q.github.io`

## 已知事项

- 当前博客采用“生活 + 技术”共用一个站点的结构：
  - 生活随笔使用 `npx hexo new life "文章标题"`，默认分类为 `生活`。
  - 技术文章使用 `npx hexo new tech "english-slug"`，默认分类为 `技术`；如果想要更干净的 URL，建议文件名用英文 slug，再把文章 front matter 的 `title` 改成中文标题。
  - 顶部菜单的 `分类` 页面会自动聚合 `生活`、`技术` 等分类。
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
  - `npm run blog:ready` 不会自动 commit 或 push，确认本地效果后再手动发布。

- `scripts/theme-patch.js` 会在 Hexo 生成前用 `layout-overrides/` 覆盖 A4 主题模板：
  - `layout-overrides/layout.ejs`
  - `layout-overrides/_partial/head.ejs`
  - `layout-overrides/_partial/footer.ejs`
- 升级 `hexo-theme-a4` 后，需要对比 `node_modules/hexo-theme-a4/layout/` 中的原始模板与 `layout-overrides/` 文件，确认新版主题结构没有变化，再重新构建。
- `source/css/unicons.css` 是对主题同名文件的本地覆盖，用于移除远程字体 fallback；升级主题后也需要与 `node_modules/hexo-theme-a4/source/css/unicons.css` 对比。
- 字体使用本地霞鹜文楷 Lite 版，覆盖常用汉字，少数生僻字会回退到系统字体。
- 首页诗词数据来自 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，运行时只读取本地 `source/data/poems.json`，不调用远程接口。
