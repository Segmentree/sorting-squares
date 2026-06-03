// Ambient declaration so the optional CommonJS export shim (used only by the
// headless Node tests) type-checks in non-module scripts.
declare var module: any;

// File System Access API — not in the ES2018/DOM lib we target. Minimal shape
// (the implementation treats handles as opaque) so the editor's "save/open to a
// real file" path type-checks. Optional, since older browsers lack it.
interface Window {
  showSaveFilePicker?: (opts?: any) => Promise<any>;
  showOpenFilePicker?: (opts?: any) => Promise<any[]>;
}
