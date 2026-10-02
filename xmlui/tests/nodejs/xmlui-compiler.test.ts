import { describe, expect, it } from "vitest";
import viteXmluiPlugin, { createXmluiCompiler } from "../../src/nodejs/vite-xmlui-plugin";

const root = process.cwd().split(String.fromCharCode(92)).join("/");

describe("createXmluiCompiler (precompile outside Vite)", () => {
  it("compiles markup to the same component the Vite transform exports", async () => {
    const source = `<Component name="Greeting"><Text value="Hello {$props.name}" /></Component>`;
    const id = `${root}/components/Greeting.xmlui`;
    const compiled = await createXmluiCompiler({}, { root }).compile(source, id);
    expect(compiled?.kind).toBe("markup");
    expect(compiled?.data.component).toMatchObject({ name: "Greeting" });
    expect(compiled?.data.src).toBe(source);

    const plugin = viteXmluiPlugin({}) as any;
    plugin.configResolved({ root });
    const emitted = await plugin.transform.call({ warn() {}, error(m: string) { throw new Error(m); } }, source, id, {});
    expect(emitted.code).toContain("Greeting");
    expect(JSON.stringify(compiled?.data.component)).toContain('"name":"Greeting"');
  });

  it("compiles a code-behind file", async () => {
    const compiled = await createXmluiCompiler({}, { root }).compile("var count = 1;\nfunction inc() { count++; }", `${root}/Main.xmlui.xs`);
    expect(compiled?.kind).toBe("script");
    expect(Object.keys(compiled?.data.functions ?? {})).toContain("inc");
  });

  it("reports a markup error as the error component, as a build does", async () => {
    const compiled = await createXmluiCompiler({}, { root }).compile(`<Component name="Bad"><Text></Component>`, `${root}/components/Bad.xmlui`);
    expect(JSON.stringify(compiled?.data.component)).toMatch(/error/i);
    expect(compiled?.errors?.length).toBeGreaterThan(0);
  });

  it("ignores files it does not handle", async () => {
    expect(await createXmluiCompiler({}, { root }).compile("{}", `${root}/config.json`)).toBeUndefined();
  });
});
