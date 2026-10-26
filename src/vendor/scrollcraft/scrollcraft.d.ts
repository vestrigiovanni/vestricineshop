// Il motore di scroll-craft (github.com/nateherkai/scroll-craft, licenza MIT).
// scrollcraft.js e scrollcraft.css sono copiati dalla skill senza modifiche:
// non si toccano per un progetto, si temano coi token e si scrive markup nostro.
// Qui solo i tipi di quello che il motore appende a `window`.

export interface ScrollCraftApi {
  layout(): void;
  read(): void;
  destroy(): void;
}

declare global {
  interface Window {
    ScrollCraft?: {
      mount(root?: Element | Document | string, opts?: { lerp?: number }): ScrollCraftApi;
      instances: ScrollCraftApi[];
    };
  }
}
