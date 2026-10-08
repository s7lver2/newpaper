// newpaper · filtrado cosmético (marco principal). Se comunica con Rust por chrome.webview.
// Los mensajes se envían como cadena JSON: el manejador IPC de wry solo acepta texto (errata 27 del plan 01).
(() => {
  const wv = window.chrome && window.chrome.webview;
  if (!wv || window.top !== window) return;
  const styleId = "np-cosmetic-" + Math.random().toString(36).slice(2);
  const seenClasses = new Set();
  const seenIds = new Set();
  let newClasses = [];
  let newIds = [];
  let timer = 0;

  function send(msg) {
    wv.postMessage(JSON.stringify(msg));
  }

  function applyCss(css) {
    let el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent += css;
  }

  function noteElement(el) {
    if (el.id && !seenIds.has(el.id)) {
      seenIds.add(el.id);
      newIds.push(el.id);
    }
    if (el.classList) {
      for (const c of el.classList) {
        if (!seenClasses.has(c)) {
          seenClasses.add(c);
          newClasses.push(c);
        }
      }
    }
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    noteElement(root);
    for (const el of root.querySelectorAll("[id],[class]")) noteElement(el);
    schedule();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      if (!newClasses.length && !newIds.length) return;
      send({
        type: "np-cosmetic-generic",
        url: location.href,
        classes: newClasses.splice(0, 1000),
        ids: newIds.splice(0, 1000),
      });
      if (newClasses.length || newIds.length) schedule();
    }, 300);
  }

  wv.addEventListener("message", (ev) => {
    const d = ev.data;
    if (d && d.type === "np-cosmetic-css" && typeof d.css === "string") applyCss(d.css);
  });

  send({ type: "np-cosmetic-init", url: location.href });

  const start = () => {
    scan(document.documentElement);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") noteElement(m.target);
        else for (const n of m.addedNodes) scan(n);
      }
      schedule();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id"],
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
