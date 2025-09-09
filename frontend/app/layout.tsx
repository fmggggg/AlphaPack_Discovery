// app/layout.tsx
import "antd/dist/reset.css";
import Providers from "./providers";

export const metadata = { title: "OMC-Lite" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 仅包一层 Client 的 Providers；不要在这里用 antd 的 Layout/组件 */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
