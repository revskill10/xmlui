// hipc (RFC 051): <Frame src="…"> — a page of this app, by URL, shown in place (no iframe). See FrameReact.tsx.
import { useCallback, useRef } from "react";
import { wrapComponent } from "../../components-core/wrapComponent";
import { createMetadata } from "../metadata-helpers";
import type { ContainerWrapperDef } from "../../components-core/rendering/ContainerWrapper";
import { FrameRouter, type FrameHandle } from "./FrameReact";

const COMP = "Frame";

export const FrameMd = createMetadata({
  status: "experimental",
  description:
    "(hipc, RFC 051) `Frame` shows a page of this app — by its URL — inside the current page, without an iframe. " +
    "Its children (normally the app's routes) render with a frame-local location: inside, `$pathname`, " +
    "`$routeParams`, `$queryParams`, links and `navigate()` are the frame's, so the window's URL never changes. " +
    "Session, data, theme and globals are the host's. A framed page talks to its host through `$frame`.",
  props: {
    src: { description: "The URL of the page to show (path, query and hash of this app).", valueType: "string" },
    name: { description: "A name for the frame (for its host's bookkeeping).", valueType: "string" },
  },
  events: {
    pick: {
      description: "A framed page picked rows (`$frame.pick(rows)`, e.g. a list's Confirm).",
      signature: "pick(rows: any[]): void",
      parameters: { rows: "The picked rows (with their labels)." },
    },
    created: {
      description: "A framed create page saved a record (`$frame.created(row)`).",
      signature: "created(row: any): void",
      parameters: { row: "The record as saved (with its label)." },
    },
    cancel: {
      description: "A framed page asked to be closed (`$frame.cancel()`).",
      signature: "cancel(): void",
    },
    navigate: {
      description: "The frame moved to another URL (inside the frame).",
      signature: "navigate(url: string): void",
      parameters: { url: "The frame's new URL." },
    },
  },
  apis: {
    reload: { description: "Renders the frame's page again (its data is fetched again).", signature: "reload(): void" },
    navigate: {
      description: "Moves the frame to another URL of this app.",
      signature: "navigate(to: string): void",
      parameters: { to: "The URL." },
    },
    current: { description: "The frame's current URL.", signature: "current(): string" },
  },
  contextVars: {
    $frame: {
      description:
        "Inside a frame: `{ name, url(), pick(rows), created(row), cancel(), open(), takesPicks, takesCreated }` — `open()` " +
        "shows the frame's page in the window; `takesCreated`: the host handles a record created in the frame. " +
        "Outside any frame it is undefined.",
      valueType: "any",
    },
  },
});

function FrameComponent({
  src,
  name,
  children,
  onPick,
  onCreated,
  onCancel,
  onNavigate,
  registerComponentApi,
  windowNavigate,
}: any) {
  const handleRef = useRef<FrameHandle | null>(null);
  const urlRef = useRef<string>(src);
  const registerHandle = useCallback(
    (h: FrameHandle) => {
      handleRef.current = h;
      registerComponentApi?.({
        reload: () => h.reload(),
        navigate: (to: string) => h.navigate(to),
        current: () => h.current(),
      });
    },
    [registerComponentApi],
  );
  const onLocationChange = useCallback(
    (url: string) => {
      urlRef.current = url;
      onNavigate?.(url);
    },
    [onNavigate],
  );
  return (
    <FrameRouter src={src} onLocationChange={onLocationChange} registerHandle={registerHandle}>
      {children({
        name,
        // A function, not a getter: XMLUI copies context values, and a copy cannot carry an accessor.
        url: () => urlRef.current,
        // The rows may come as a promise (labels resolved by the page): the host gets them resolved.
        pick: (rows: any[] | Promise<any[]>) => Promise.resolve(rows).then((r) => onPick?.(r)),
        takesPicks: !!onPick,
        takesCreated: !!onCreated,
        created: (row: any) => onCreated?.(row),
        cancel: () => onCancel?.(),
        open: () => windowNavigate?.(urlRef.current),
      })}
    </FrameRouter>
  );
}

export const frameComponentRenderer = wrapComponent(COMP, FrameComponent, FrameMd, {
  exposeRegisterApi: true,
  customRender: (_props, { node, extractValue, renderChild, registerComponentApi, lookupEventHandler, appContext }) => (
    <FrameComponent
      src={extractValue.asOptionalString(node.props.src, "/")}
      name={extractValue.asOptionalString(node.props.name)}
      onPick={lookupEventHandler("pick")}
      onCreated={lookupEventHandler("created")}
      onCancel={lookupEventHandler("cancel")}
      onNavigate={lookupEventHandler("navigate")}
      registerComponentApi={registerComponentApi}
      windowNavigate={(url: string) => appContext?.navigate?.(url)}
    >
      {(frame: any) =>
        renderChild({
          type: "Container",
          contextVars: { $frame: frame },
          children: node.children,
        } as ContainerWrapperDef)
      }
    </FrameComponent>
  ),
});
