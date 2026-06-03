/* Navigation helper shared by the play page and the editor.
 *
 * Two run modes are supported transparently:
 *  - Two-file mode (dev / served): each page is a top-level document and we
 *    navigate with normal URLs + query strings (index.html?level=ID, etc).
 *  - Single-file mode (the build): both pages live inside one shell document
 *    and are shown in an <iframe srcdoc>. We then route via the parent's
 *    location.hash (#play?level=ID, #editor?edit=ID) and read params from it.
 */

type ViewName = "play" | "editor";

function inEmbeddedView(): boolean {
  try { return window.self !== window.top; } catch (e) { return true; }
}

// Params for the current view (works in both modes).
export function routeParams(): URLSearchParams {
  let qs = "";
  if (inEmbeddedView()) {
    try { qs = (window.parent.location.hash.split("?")[1]) || ""; } catch (e) { qs = ""; }
  } else {
    qs = window.location.search.replace(/^\?/, "");
  }
  return new URLSearchParams(qs);
}

// Switch to another view ("play" | "editor"), optionally with params.
export function gotoView(view: ViewName, params?: Record<string, string>): void {
  const qs = params && Object.keys(params).length
    ? "?" + new URLSearchParams(params).toString()
    : "";
  if (inEmbeddedView()) {
    try { window.parent.location.hash = view + qs; return; } catch (e) { /* fall through */ }
  }
  window.location.href = (view === "editor" ? "level-editor.html" : "index.html") + qs;
}
