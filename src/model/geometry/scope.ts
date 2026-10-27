// manifold の WASM オブジェクトは GC されないので、生成したものをまとめて delete() する

interface Deletable {
  delete(): void;
}

export class Scope {
  private items: Deletable[] = [];

  /** 生成したオブジェクトを登録して、そのまま返す */
  keep<T extends Deletable>(obj: T): T {
    this.items.push(obj);
    return obj;
  }

  /** 登録済みのオブジェクトをすべて解放する。except に渡したものは残す */
  dispose(...except: Deletable[]): void {
    for (const obj of this.items) {
      if (!except.includes(obj)) obj.delete();
    }
    this.items = [];
  }
}
