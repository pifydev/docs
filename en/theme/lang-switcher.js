// Pify Agent Book — language switcher.
//
// mdBook serves en/ and vi/ from sibling folder roots. The chapter
// file names are identical across the two trees (ch01-overview.md,
// ch02-three-layer-arch.md, ...), so swapping languages is a simple
// URL-path rewrite.
//
// Detects the current language from the URL path prefix, then builds
// the equivalent URL for the target language. Inserts a dropdown
// button into the existing menu bar (#mdbook-menu-bar) just after
// .menu-title.
//
// zh/ (Chinese canonical) is intentionally NOT shown in the picker:
// the swap button is for readers moving between the English and
// Vietnamese translations of the same content.

(function () {
  "use strict";

  var LANGS = [
    { code: "en", label: "English" },
    { code: "vi", label: "Tiếng Việt" }
  ];

  function detectCurrentLang() {
    var path = window.location.pathname;
    var match = path.match(/^\/(en|vi)\//);
    if (match) return match[1];
    // Fallback: mdBook may serve at root for one of the languages.
    // Detect from <html lang="..."> as a last resort.
    var htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
    if (htmlLang.indexOf("vi") === 0) return "vi";
    return "en";
  }

  function buildTargetUrl(targetLang) {
    var path = window.location.pathname;
    // Strip current /en/ or /vi/ prefix.
    var stripped = path.replace(/^\/(en|vi)\//, "/");
    return "/" + targetLang + stripped;
  }

  function isCurrentPage() {
    return this.classList.contains("current");
  }

  function render(currentLang) {
    var menuBar = document.getElementById("mdbook-menu-bar");
    if (!menuBar) return;
    var title = menuBar.querySelector(".menu-title");
    if (!title) return;

    // Build wrapper
    var wrap = document.createElement("div");
    wrap.className = "lang-switcher";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-switcher-btn";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    var currentLabel = LANGS.filter(function (l) {
      return l.code === currentLang;
    })[0].label;
    btn.innerHTML =
      '<span class="lang-current">' +
      currentLabel +
      '</span><span class="lang-caret" aria-hidden="true">\u25BE</span>';

    var list = document.createElement("ul");
    list.className = "lang-switcher-menu";
    list.setAttribute("role", "menu");
    list.hidden = true;

    LANGS.forEach(function (lang) {
      var li = document.createElement("li");
      li.setAttribute("role", "menuitem");
      var a = document.createElement("a");
      a.href = buildTargetUrl(lang.code);
      a.textContent = lang.label;
      if (lang.code === currentLang) {
        a.classList.add("current");
        a.setAttribute("aria-current", "true");
      }
      li.appendChild(a);
      list.appendChild(li);
    });

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !list.hidden;
      list.hidden = open;
      btn.setAttribute("aria-expanded", open ? "false" : "true");
    });

    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) {
        list.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !list.hidden) {
        list.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        btn.focus();
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(list);
    title.parentNode.insertBefore(wrap, title.nextSibling);
  }

  function init() {
    var lang = detectCurrentLang();
    render(lang);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
