
import type {Estimate} from './estimate';

export interface OpEventDetail {
  name: string;
  ops: (() => void)[];
}

export interface PatchEventDetail {
  name: string;
  text?: string;
  estimate?: Estimate;
  date?: Date;
}

export function fireOps(
    target: EventTarget, name: string, ops: (() => void)[]) {
  console.log('fireOps', name, ops);
  target.dispatchEvent(
      new CustomEvent('op', {
        detail: {name, ops} as OpEventDetail,
        bubbles: true,
        composed: true
      }),
  );
}

export function firePatch(target: EventTarget, detail: PatchEventDetail) {
  console.log('firePatch', detail);
  target.dispatchEvent(
      new CustomEvent('patch', {
        detail: detail,
        bubbles: true,
        composed: true
      }),
  );
}

declare global {
  interface WindowEventMap {
    'op': CustomEvent<OpEventDetail>;
    'patch': CustomEvent<PatchEventDetail>;
  }
}
