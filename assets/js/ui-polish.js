/* =========================================================
   UI/UX POLISH V1
   Visual interaction layer only.
   No API/accounting/PDF generation logic is changed here.
   ========================================================= */

function enhanceButton(button) {
  if (!button || button.dataset.uiPolished === "1") return;
  button.dataset.uiPolished = "1";

  if (button.matches("[data-pdf-action]")) {
    button.setAttribute("aria-label", button.getAttribute("title") || "Buat PDF");
  }

  if (button.matches("[data-wa-action]")) {
    button.setAttribute("aria-label", button.getAttribute("title") || "Bagikan melalui WhatsApp");
  }
}

function enhanceTree(root) {
  if (!root || root.nodeType !== 1) return;

  if (root.matches("button")) enhanceButton(root);

  root.querySelectorAll?.("button").forEach(enhanceButton);
}

function markBusy(button, duration = 900) {
  if (!button || button.disabled) return;

  button.classList.add("ui-busy");
  button.setAttribute("aria-busy", "true");
  button.dataset.uiBusy = "1";

  window.setTimeout(() => {
    button.classList.remove("ui-busy");
    button.removeAttribute("aria-busy");
    delete button.dataset.uiBusy;
  }, duration);
}

function installInteractionPolish() {
  enhanceTree(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) enhanceTree(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");

    if (!button || button.disabled) return;

    if (button.matches("[data-wa-action]")) {
      markBusy(button, 900);
    }

    if (button.matches("#piutang-refresh")) {
      markBusy(button, 1200);
    }
  }, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installInteractionPolish, { once: true });
} else {
  installInteractionPolish();
}
