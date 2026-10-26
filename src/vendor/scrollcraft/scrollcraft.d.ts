// Il motore di scroll-craft (github.com/nateherkai/scroll-craft, licenza MIT).
// scrollcraft.css è copiato dalla skill senza modifiche. scrollcraft.js ha due
// ritocchi segnati "Vestri Cinema" (26 ottobre 2026, sera): scrive gli stili
// solo quando cambiano, e non fa girare il ciclo dei video quando non ce ne
// sono. Su Firefox ogni scrittura inutile era un ricalcolo degli stili.
// Qui solo i tipi di quello che il motore appende a `window`.

/** Un atto come lo tiene il motore: `p` è il progresso che pubblica in `--sc-p`. */
export interface ScrollCraftAct {
  el: HTMLElement;
  p: number;
  pinned: boolean;
}

export interface ScrollCraftApi {
  layout(): void;
  read(): void;
  destroy(): void;
  acts: ScrollCraftAct[];
}

declare global {
  interface Window {
    ScrollCraft?: {
      mount(root?: Element | Document | string, opts?: { lerp?: number }): ScrollCraftApi;
      instances: ScrollCraftApi[];
    };
  }
}
