import type { Locale } from "@/lib/i18n";
import { i18n } from "@/lib/i18n";
import { uiTranslations } from "fumadocs-ui/i18n";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: { displayName: "English" },
    vi: {
      displayName: "Tiếng Việt",
      "Back to Home(404 page)": "Về trang chủ",
      "Choose a language(language switcher)": "Chọn ngôn ngữ",
      "Choose a language(language switcher)(aria-label)": "Chọn ngôn ngữ",
      "Close Search(search dialog)(aria-label)": "Đóng tìm kiếm",
      "Close Sidebar(sidebar)(aria-label)": "Đóng thanh điều hướng",
      "Copied Text(code block)(aria-label)": "Đã sao chép",
      "Copy Text(code block)(aria-label)": "Sao chép",
      "Dark(theme switcher)(aria-label)": "Tối",
      "Light(theme switcher)(aria-label)": "Sáng",
      "Next Page(pagination)": "Trang sau",
      "No Headings(table of contents)": "Không có đề mục",
      "No results found(search dialog)": "Không tìm thấy kết quả",
      "On this page(table of contents)": "Trong trang này",
      "Open Search(search trigger)(aria-label)": "Mở tìm kiếm",
      "Open Sidebar(sidebar)(aria-label)": "Mở thanh điều hướng",
      "Page Not Found(404 page)": "Không tìm thấy trang",
      "Previous Page(pagination)": "Trang trước",
      "Search(search dialog)": "Tìm kiếm",
      "Search(search trigger)": "Tìm kiếm",
      "System(theme switcher)(aria-label)": "Hệ thống",
      "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
        "Trang bạn tìm có thể đã bị xoá, đổi tên hoặc tạm thời không khả dụng.",
      "Toggle Menu(mobile menu)(aria-label)": "Mở hoặc đóng menu",
      "Toggle Theme(theme switcher)(aria-label)": "Đổi giao diện",
    },
  });

function Brand() {
  return (
    <span className="pify-brand">
      <picture>
        <source srcSet="/pify-on-dark-128.png" media="(prefers-color-scheme: dark)" />
        <img src="/pify-on-light-128.png" alt="" width={28} height={28} />
      </picture>
      <span>Pify</span>
    </span>
  );
}

export function baseOptions(locale: Locale): BaseLayoutProps {
  return {
    nav: {
      title: <Brand />,
      url: `/${locale}`,
      transparentMode: "none",
    },
    githubUrl: "https://github.com/pifydev/docs",
    links: [
      {
        text: locale === "vi" ? "Bắt đầu nhanh" : "Quickstart",
        url: `/${locale}/quickstart`,
        active: "url",
      },
    ],
  };
}
