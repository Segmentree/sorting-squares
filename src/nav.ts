type ViewName = "play" | "editor";

export function routeParams(): URLSearchParams {
  return new URLSearchParams(window.location.search.replace(/^\?/, ""));
}

export function gotoView(view: ViewName, params?: Record<string, string>): void {
  const qs = params && Object.keys(params).length
    ? "?" + new URLSearchParams(params).toString()
    : "";
  window.location.href = (view === "editor" ? "level-editor.html" : "index.html") + qs;
}
