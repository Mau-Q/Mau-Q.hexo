# Mau-Q Hexo Blog

源码工程，生成输出到 [`Mau-Q.github.io`](https://mau-q.github.io)。

## 常用命令

```bash
# 本地预览
npm run server          # http://localhost:4000

# 新建文章
npx hexo new "文章标题"

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
| `source/css/custom.css` | 自定义 CSS（字体、代码块等） |
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

- `scripts/theme-patch.js` 会在 Hexo 生成前用 `layout-overrides/` 覆盖 A4 主题模板：
  - `layout-overrides/layout.ejs`
  - `layout-overrides/_partial/head.ejs`
  - `layout-overrides/_partial/footer.ejs`
- 升级 `hexo-theme-a4` 后，需要对比 `node_modules/hexo-theme-a4/layout/` 中的原始模板与 `layout-overrides/` 文件，确认新版主题结构没有变化，再重新构建。
- `source/css/unicons.css` 是对主题同名文件的本地覆盖，用于移除远程字体 fallback；升级主题后也需要与 `node_modules/hexo-theme-a4/source/css/unicons.css` 对比。
- 字体使用本地霞鹜文楷 Lite 版，覆盖常用汉字，少数生僻字会回退到系统字体。
