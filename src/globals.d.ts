// File System Access API — not in the ES2020/DOM lib we target. Minimal shape
// (the implementation treats handles as opaque) so the editor's "save/open to a
// real file" path type-checks. Optional, since older browsers lack it.
interface Window {
  showSaveFilePicker?: (opts?: any) => Promise<any>;
  showOpenFilePicker?: (opts?: any) => Promise<any[]>;
}
