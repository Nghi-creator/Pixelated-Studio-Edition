import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

type FakeNode = {
  textContent: string;
};

class FakeLogElement {
  childNodes: FakeNode[] = [];
  scrollHeight = 0;
  scrollTop = 0;

  get firstChild() {
    return this.childNodes[0] || null;
  }

  append(...nodes: FakeNode[]) {
    this.childNodes.push(...nodes);
    this.scrollHeight = this.childNodes.length;
  }

  removeChild(node: FakeNode) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    return node;
  }

  replaceChildren() {
    this.childNodes = [];
  }
}

test("desktop build logs retain only the newest bounded entries", async () => {
  const runtime = globalThis as unknown as {
    document: {
      createElement: (tag: string) => FakeNode;
      createTextNode: (text: string) => FakeNode;
    };
    window: {
      PixelatedLogs?: {
        createLogController: (elements: { logBox: HTMLElement }) => {
          append: (message: string) => void;
        };
        maxEntries: number;
      };
    };
  };
  runtime.window = {};
  runtime.document = {
    createElement: (tag) => ({ textContent: tag }),
    createTextNode: (text) => ({ textContent: text }),
  };

  vm.runInThisContext(
    fs.readFileSync(
      path.resolve(__dirname, "../../../renderer/logs.js"),
      "utf8",
    ),
  );
  const logBox = new FakeLogElement();
  const logs = runtime.window.PixelatedLogs;
  assert.ok(logs);
  const controller = logs.createLogController({
    logBox: logBox as unknown as HTMLElement,
  });

  for (let index = 0; index < logs.maxEntries + 5; index += 1) {
    controller.append(`line-${index}`);
  }

  assert.equal(logBox.childNodes.length, logs.maxEntries * 2);
  assert.equal(logBox.childNodes[0]?.textContent, "line-5");
  assert.equal(
    logBox.childNodes.at(-2)?.textContent,
    `line-${logs.maxEntries + 4}`,
  );
});
