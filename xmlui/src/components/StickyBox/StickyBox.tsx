import styles from "./StickyBox.module.scss";

import { wrapComponent } from "../../components-core/wrapComponent";
import { parseScssVar } from "../../components-core/theming/themeVars";
import { StickyBox } from "./StickyBoxReact";
import { defaultProps } from "./StickyBox.defaults";
import { createMetadata } from "../metadata-helpers";

const COMP = "StickyBox";

export const StickyBoxMd = createMetadata({
  status: "stable",
  description:
    "`StickyBox` remains fixed at the top or bottom of the screen as the user scrolls.",
  props: {
    to: {
      description:
        "This property determines whether the StickyBox should be anchored to " +
        "the \`top\` or \`bottom\`.",
      availableValues: ["top", "bottom"],
      isStrictEnum: true,
      valueType: "string",
      defaultValue: defaultProps.to,
    },
    floating: {
      description:
        "When true, the box floats over the page instead of being a bar: it paints no background and only its " +
        "content catches the pointer, so the page beneath its empty area stays visible and clickable (e.g. a " +
        "floating action button).",
      valueType: "boolean",
      defaultValue: defaultProps.floating,
    },
  },
  themeVars: parseScssVar(styles.themeVars),
  defaultThemeVars: {
    [`backgroundColor-${COMP}`]: "$backgroundColor",
  },
});

export const stickyBoxComponentRenderer = wrapComponent(COMP, StickyBox, StickyBoxMd, {
  passUid: true,
});
