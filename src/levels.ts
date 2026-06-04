import * as format from "./levels/format.js";
import * as store from "./levels/store.js";
import { fs } from "./levels/file.js";
import { cloud, schedulePush } from "./levels/cloud.js";

export type { Level } from "./levels/format.js";

store.setOnChange(schedulePush);

export const Levels = {
  KEY: store.KEY,
  SHAPES: format.SHAPES,
  SIDES: format.SIDES,
  FACINGS: format.FACINGS,
  SIZE_MIN: format.SIZE_MIN,
  SIZE_MAX: format.SIZE_MAX,
  list: store.list,
  get: store.get,
  save: store.save,
  remove: store.remove,
  validate: format.validate,
  normalize: format.normalize,
  importJSON: store.importJSON,
  exportLevel: store.exportLevel,
  exportAll: store.exportAll,
  download: store.download,
  fs,
  cloud,
};
