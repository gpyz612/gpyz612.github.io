# 2024612 线路测速

独立纯静态测速页，用于比较以下三条线路：

- Cloudflare Pages：`https://ww3.2024612.xyz`
- Netlify：`https://ww2.2024612.xyz`
- Vercel：`https://ww1.2024612.xyz`
- 测速页域名：`https://t.2024612.xyz`

## 本地运行

```powershell
npm run build
npm run dev
```

打开 `http://127.0.0.1:4173`。本地页面仍会测试线上三个域名；三个域名必须部署本目录生成的同一份 `dist`，否则页面会提示测速资源或 CORS 配置异常。

## 部署

三个平台都将项目根目录设置为 `speed-test`：

| 平台 | 构建命令 | 输出目录 | 自定义域名 |
| --- | --- | --- | --- |
| Cloudflare Pages | `npm run build` | `dist` | `ww3.2024612.xyz` |
| Netlify | 自动读取 `netlify.toml` | `dist` | `ww2.2024612.xyz` |
| Vercel | 自动读取 `vercel.json` | `dist` | `ww1.2024612.xyz` |

再将 `t.2024612.xyz` 绑定到其中一个部署（建议 Cloudflare Pages），作为测速入口。三条被测线路都需要保留 `probe.txt`、`__speed/payload.bin` 和跨域响应头。

## 测量说明

- 延迟：5 次小文件请求的中位数。
- 抖动：相邻延迟变化绝对值的平均数。
- 下载：依次下载每条线路的静态测速文件，避免并行下载互相抢占带宽。
- 快速模式约消耗 3 MB，标准模式约消耗 12 MB，不执行上传测试，也不保存结果。
