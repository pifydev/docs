"use client";

import { useDocsLayout } from "fumadocs-ui/layouts/docs";
import { useEffect } from "react";

const mobileSidebarId = "nd-sidebar-mobile";

/** Add the keyboard dismissal and focus restoration expected of a modal drawer. */
export function MobileSidebarDismiss() {
  const { slots } = useDocsLayout();
  const { open, setOpen } = slots.sidebar.useSidebar();

  useEffect(() => {
    if (!open) return;

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(
            `button[aria-controls="${mobileSidebarId}"]`,
          )
          ?.focus();
      });
    }

    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [open, setOpen]);

  return null;
}
