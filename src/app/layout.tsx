import type { Metadata } from "next";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "material-symbols/outlined.css";
import "@/styles/app.scss";

export const metadata: Metadata = {
  title: "ระบบบริหารโครงการ ISO/IEC 29110",
  description: "ระบบบริหารโครงการตามมาตรฐาน ISO/IEC 29110",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
