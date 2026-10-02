import { ComponentMetadata } from "../../abstractions/ComponentDefs";
import { useTheme } from "./ThemeContext";
import { useMemo } from "react";
import { useStyles } from "./StyleContext";
import { THEME_VAR_PREFIX } from "./component-layout-resolver";
import { useComponentRegistry } from "../../components/ComponentRegistryContext";
import { parseHVar } from "./hvar";

/**
 * Each theme can have a light or a dark tone.
 */
export const ThemeToneKeys = ["light", "dark"] as const;

export const SizeScaleKeys = {
  // small scale
  none: "none",
  xs: "xs",
  sm: "sm",
  md: "md",
  // large scale
  lg: "lg",
  xl: "xl",
  "2xl": "2xl",
  "3xl": "3xl",
} as const;

export const SizeScaleReadableKeys = {
  // small scale
  none: "None",
  xs: "Extra Small",
  sm: "Small",
  md: "Medium",
  // large scale
  lg: "Large",
  xl: "Extra Large",
  "2xl": "Double Extra Large",
  "3xl": "Triple Extra Large",
} as const;

/**
 * Pins the theme variables a component uses, resolved in the theme scope it renders in, on its element.
 * `componentScopedOnly` (user-defined components): pin only component-scoped variables (e.g. `width-MyCard`). A
 * user-defined component's root is often a `<Theme>` of its own, and the pinned class reaches that Theme's first
 * child: pinning base variables (`color-primary-500`) there would override the component's own Theme with the outer
 * values. Base variables inherit through CSS anyway, so nothing else changes.
 */
export function useComponentThemeClass(descriptor: ComponentMetadata, { componentScopedOnly = false } = {}) {
  let themeScope = useTheme();
  const componentRegistry = useComponentRegistry();

  const themeVars = useMemo(() => {
    const ret = {};

    // --- Theme vars defined by the component itself
    let collectedThemeVars = {
      ...(descriptor?.themeVars || {}),
      ...(descriptor?.defaultThemeVars || {}),
    };

    if (descriptor?.themeVarContributorComponents) {
      descriptor.themeVarContributorComponents.forEach((contributorComponent) => {
        const contributorDescriptor = componentRegistry.lookupComponentRenderer(contributorComponent)?.descriptor;
        if (contributorDescriptor) {
          collectedThemeVars = {
            ...collectedThemeVars,
            ...(contributorDescriptor.themeVars || {}),
            ...(contributorDescriptor.defaultThemeVars || {}),
          };
        }
      });
    }

    Object.entries(collectedThemeVars).forEach(([key]) => {
      let keyWithoutClass = key.replace("Input:", "").replace("Heading:", "");
      if (componentScopedOnly && !parseHVar(keyWithoutClass)?.component) {
        return;
      }
      // Use themeScope.themeVars (allThemeVarsWithResolvedHierarchicalVars) instead of getThemeVar,
      // because getThemeVar only follows pure $-reference chains and does NOT resolve embedded
      // $-references in compound values like "1px solid $borderColor".
      // themeScope.themeVars has already gone through resolveThemeVarsWithCssVars, which converts
      // all $varName occurrences to var(--xmlui-varName), even inside compound values.
      let themeVar = themeScope.themeVars[keyWithoutClass];
      if (themeVar != undefined && (typeof themeVar === "string" && themeVar.trim() !== "")) {
        ret[`--${THEME_VAR_PREFIX}-` + keyWithoutClass] = themeVar;
      }
    });

    return ret;
  }, [
    descriptor?.themeVars,
    descriptor?.defaultThemeVars,
    descriptor?.themeVarContributorComponents,
    componentScopedOnly,
    themeScope,
    themeScope.themeVars,
    componentRegistry,
  ]);

  return useStyles(themeVars);
}
