import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@ai-job-os/core",
    "@ai-job-os/crawlers",
  ],
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "chromium-bidi",
    "@react-pdf/renderer",
  ],
  webpack(config, { isServer }) {
    // workspace 包源码用 NodeNext 风格的 .js 扩展名 import TS 文件，
    // 告诉 webpack .js 可以解析到 .ts/.tsx（对应 tsconfig 的 NodeNext 行为）
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    // 重量级/含原生或 wasm 的依赖不打进 bundle（webpack 打包会破坏其内部结构）：
    //  - playwright 系列：浏览器驱动
    //  - @react-pdf/renderer：含 yoga wasm 布局引擎，被打包后运行时报 reading 'S'
    // 服务端运行时从 node_modules 直接 require。
    if (isServer) {
      const externals = [
        "playwright",
        "playwright-core",
        "chromium-bidi",
        "@ai-job-os/resume-render",
        "@react-pdf/renderer",
        "@react-pdf/layout",
        "@react-pdf/pdfkit",
        "@react-pdf/font",
        "@react-pdf/render",
        "@react-pdf/textkit",
        "@react-pdf/primitives",
        "yoga-layout",
      ];
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]),
        ({ request }: { request?: string }, cb: (err?: null, result?: string) => void) => {
          if (request && externals.some((e) => request === e || request.startsWith(`${e}/`))) {
            return cb(null, `commonjs ${request}`);
          }
          cb();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;