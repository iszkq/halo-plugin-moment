# halo-plugin-moment

Halo 2 的瞬间插件，内置仿微信朋友圈风格的前台页面，不再依赖主题额外提供 `moments.html` 模板。

仓库地址：[iszkq/halo-plugin-moment](https://github.com/iszkq/halo-plugin-moment)

![Preview](./images/plugin-moments-preview.png)

## 介绍

这个项目基于 Halo 官方 `plugin-moments` 二次开发，目标是补齐“瞬间只有后台、没有可直接访问前台页面”的问题。

当前版本已经具备：

- Halo 后台瞬间发布与管理
- 前台独立页面渲染
- 仿微信朋友圈风格的信息流布局
- 图文、视频、音频内容展示
- 标签筛选
- 瞬间详情页
- GitHub Actions 自动打包 JAR

## 前台访问地址

安装并启用插件后，可直接访问：

- `/moments`
- `/moments/page/{page}`
- `/moments/{name}`

为了排障，也保留了以下辅助地址：

- `/plugins/moment-circle/health`
- `/plugins/moment-circle/debug/resources`
- `/plugins/moment-circle/view`

## 与官方瞬间插件的关系

本项目复用了 Halo 官方 `plugin-moments` 的数据模型与 API。

这意味着：

- 可以复用原有瞬间的后台能力
- 不需要额外适配主题模板
- 不建议与官方 `plugin-moments` 同时启用

如果你已经安装官方瞬间插件，建议先停用或卸载，再安装当前插件。

## 功能特性

- 前台页面内置在插件中，不依赖主题模板
- 页面结构参考 `Hugo-Theme-Amigo-main`
- 支持封面、头像、昵称、签名等页面资料配置
- 支持图片九宫格展示
- 支持音频、视频内容展示
- 支持标签筛选和分页
- 支持瞬间详情页浏览
- 支持通过 GitHub Actions 打包构建产物

## 安装方式

### 方式一：通过 GitHub Actions 打包

如果本地没有 Java / Node / pnpm 构建环境，推荐直接用 GitHub Actions。

1. 将仓库推送到 GitHub。
2. 打开仓库 `Actions`。
3. 手动运行 `Package` 工作流，或推送 `v*` 标签触发打包。
4. 在 `Artifacts` 中下载生成的 JAR。
5. 在 Halo 后台安装该 JAR。

相关工作流文件：

- [package.yaml](./.github/workflows/package.yaml)
- [ci.yaml](./.github/workflows/ci.yaml)
- [cd.yaml](./.github/workflows/cd.yaml)

### 方式二：本地构建

所需环境：

- Java 17
- Node 20
- pnpm 10

构建命令：

```bash
# macOS / Linux
chmod +x ./gradlew
./gradlew build

# Windows
./gradlew.bat build
```

构建完成后，JAR 默认位于：

```text
build/libs/
```

## 插件配置

当前插件提供以下前台配置项：

- 页面标题
- 列表每页显示条数
- 顶部昵称
- 个性签名
- 顶部头像地址
- 封面图地址
- 页脚文案
- 强调色

这些配置用于控制 `/moments` 页面的展示效果。

## 公开 API

### 页面配置

```text
/apis/api.moment.halo.run/v1alpha1/page-config
```

用于前台页面读取：

- 页面标题
- 每页条数
- 昵称
- 签名
- 头像
- 封面
- 页脚文案
- 强调色
- 标签列表

### 查询瞬间列表

```text
/apis/api.moment.halo.run/v1alpha1/moments
```

支持参数：

- `page`
- `size`
- `tag`
- `ownerName`
- `startDate`
- `endDate`
- `sort`

### 查询瞬间详情

```text
/apis/api.moment.halo.run/v1alpha1/moments/{name}
```

## 开发说明

前台页面资源位于：

- [moments-app.html](./src/main/resources/frontend/moments-app.html)
- [moments-app.css](./src/main/resources/frontend/moments-app.css)
- [moments-app.js](./src/main/resources/frontend/moments-app.js)

路由实现位于：

- [MomentRouter.java](./src/main/java/run/halo/moments/MomentRouter.java)

页面配置接口位于：

- [MomentQueryEndpoint.java](./src/main/java/run/halo/moments/MomentQueryEndpoint.java)

## 注意事项

- 当前项目更适合作为官方瞬间插件的增强替代版使用。
- 如果你修改了前台资源但浏览器页面没有变化，优先尝试无痕窗口或强制刷新。
- 如果页面访问异常，可先访问：
  - `/plugins/moment-circle/health`
  - `/plugins/moment-circle/debug/resources`

## 规划

后续可以继续增强：

- 更高还原度的朋友圈交互
- 点赞与评论的更完整前台展示
- 更接近 `Hugo-Theme-Amigo-main` 的细节还原
- 主题/用户资料联动
- 更强的移动端适配

## 致谢

- [halo-sigs/plugin-moments](https://github.com/halo-sigs/plugin-moments)
- `Hugo-Theme-Amigo-main`
