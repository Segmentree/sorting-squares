export type BoxState = "idle" | "moving" | "placed";

export interface Slot {
  r: number;
  c: number;
  wall: number;
  filled: boolean;
  reserved: boolean;
  el: SVGPolygonElement;
  wallLine?: SVGLineElement;
}

export interface Box {
  id: number;
  r: number;
  c: number;
  state: BoxState;
  target: Slot | null;
  tag: RC | null;
  red: boolean;
  el: HTMLElement;
}

export interface RC { r: number; c: number; }
export interface BoxRC { r: number; c: number; red?: boolean; tag?: RC; }

export interface Spec {
  shape: string;
  rows: number;
  cols: number;
  slots: Array<{ r: number; c: number; wall: number }>;
  boxes: BoxRC[];
  holes?: RC[];
  solids?: RC[];
}
