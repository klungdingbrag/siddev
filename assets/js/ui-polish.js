/* =========================================================
   UI/UX POLISH V2
   Visual + interaction layer only.
   No API/accounting/PDF generation logic is changed here.
   ========================================================= */

const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const modalFocusState = new WeakMap();
let activeDialog = null;

function isVisibleDialog(dialog) {
  return dialog?.matches('[role="dialog"][aria-modal="true"]') &&
    !dialog.closest(".hidden") &&
    dialog.getAttribute("aria-hidden") !== "true";
}

function getFocusableElements(dialog) {
  return [...dialog.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;

    const style = window.getComputedStyle(element);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0;
  });
}

function focusDialog(dialog) {
  if (!isVisibleDialog(dialog)) return;

  let panel = dialog.querySelector('[role="dialog"]');
  if (!panel) panel = dialog;

  if (!panel.hasAttribute("tabindex")) {
    panel.setAttribute("tabindex", "-1");
  }

  const focusable = getFocusableElements(panel);
  const target = focusable[0] || panel;

  window.requestAnimationFrame(() => {
    if (isVisibleDialog(dialog)) target.focus({ preventScroll: true });
  });
}

function rememberDialogTrigger(dialog) {
  const current = document.activeElement;
  if (current && !dialog.contains(current)) {
    modalFocusState.set(dialog, { trigger: current });
  }
}

function restoreDialogFocus(dialog) {
  const saved = modalFocusState.get(dialog);
  const trigger = saved?.trigger;

  modalFocusState.delete(dialog);

  if (trigger && document.contains(trigger) && !trigger.disabled) {
    window.requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
  }
}

function getTopmostDialog() {
  const dialogs = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  return dialogs.reverse().find(isVisibleDialog) || null;
}

function handleModalFocusKeydown(event) {
  if (event.key !== "Tab") return;

  const dialog = getTopmostDialog();
  if (!dialog) return;

  const focusable = getFocusableElements(dialog);
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === first || !dialog.contains(document.activeElement)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    }
    return;
  }

  if (document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function observeModalFocus() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "attributes") continue;

      const dialog = mutation.target;
      if (!dialog.matches?.('[role="dialog"][aria-modal="true"]')) continue;

      if (mutation.attributeName === "aria-hidden" || mutation.attributeName === "class") {
        const visible = isVisibleDialog(dialog);
        const wasVisible = mutation.attributeName === "aria-hidden"
          ? mutation.oldValue !== "true"
          : !dialog.classList.contains("hidden");

        if (visible && !modalFocusState.has(dialog)) {
          rememberDialogTrigger(dialog);
          activeDialog = dialog;
          focusDialog(dialog);
        } else if (!visible && wasVisible) {
          restoreDialogFocus(dialog);
          if (activeDialog === dialog) activeDialog = null;
        }
      }
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-hidden"],
    attributeOldValue: true
  });

  document.addEventListener("keydown", handleModalFocusKeydown, true);
}

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

  root.querySelectorAll?.('[role="dialog"][aria-modal="true"]').forEach((dialog) => {
    const panel = dialog.querySelector('[role="dialog"]') || dialog;
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
  });
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
  observeModalFocus();

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
