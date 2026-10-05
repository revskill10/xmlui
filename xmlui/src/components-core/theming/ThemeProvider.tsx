import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  generateBaseFontSizes,
  generateBaseSpacings,
  generateBaseTones,
  generateBootstrapBaseColumns,
  generateBorderSegments,
  generateButtonTones,
  generatePaddingSegments,
  generateTextFontSizes,
  resolveThemeVar,
} from "./transformThemeVars";
import { normalizePath } from "../utils/misc";
import { matchThemeVar } from "../theming/hvar";
import { ThemeContext, ThemesContext } from "../theming/ThemeContext";
import themeVars, { getVarKey } from "../theming/themeVars";
import { replaceThemeVarRefs } from "./transformThemeVars";
import { EMPTY_ARRAY, EMPTY_OBJECT } from "../constants";
import { collectThemeChainByExtends } from "../theming/extendThemeUtils";
import { useComponentRegistry } from "../../components/ComponentRegistryContext";
import {
  XmlUiBlogThemeDefinition,
  XmlUiCyanThemeDefinition,
  XmlUiGrayThemeDefinition,
  XmlUiGreenThemeDefinition,
  XmlUiOrangeThemeDefinition,
  XmlUiPurpleThemeDefinition,
  XmlUiRedThemeDefinition,
  XmlUiThemeDefinition,
  XmlUiWebThemeDefinition,
} from "../theming/themes/xmlui";
import { useIsomorphicLayoutEffect } from "../utils/hooks";
import type {
  AppThemes,
  FontDef,
  ThemeDefinition,
  ThemeScope,
  ThemeTone,
} from "../../abstractions/ThemingDefs";
import { omit } from "lodash-es";
import { ThemeToneKeys } from "./utils";
import { useDomRoot } from "./StyleContext";
import { validateTheme } from "./validator";
import { emitThemeDiagnostics } from "./validator/emit";
import { pushXsLog } from "../inspector/inspectorUtils";
import { checkThemeContrast } from "../accessibility/contrast";
import type { ThemeVarMetadata } from "../../abstractions/ComponentDefs";
import type { ThemeDiagnostic } from "./validator/diagnostics";

function collectThemeVarKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (!value || typeof value !== "object") return keys;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "light" || key === "dark" || key === "tones") {
      collectThemeVarKeys(nested, keys);
      continue;
    }
    keys.add(key);
    if (nested && typeof nested === "object") {
      collectThemeVarKeys(nested, keys);
    }
  }
  return keys;
}

function addKnownThemeVarName(known: Set<string>, name: string): void {
  known.add(name);
  const denamespaced = name.substring(name.lastIndexOf(":") + 1);
  known.add(denamespaced);
}

function sanitizeThemeVarsForStrictTheming(
  vars: Record<string, string> | undefined,
  strictTheming: boolean | undefined,
  declarations: ReadonlyMap<string, ThemeVarMetadata>,
  knownNames: ReadonlySet<string>,
  invalidNames?: Set<string>,
  diagnostics?: Array<ThemeDiagnostic>,
): Record<string, string> {
  if (!vars || !strictTheming) {
    return vars ?? {};
  }
  const normalizedVars = Object.fromEntries(
    Object.entries(vars).filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== ""),
  ) as Record<string, string>;
  const resolved = new Map<string, string>();
  Object.entries(normalizedVars).forEach(([key, value]) => {
    resolved.set(key, resolveThemeVar(key, normalizedVars));
  });
  const allDiagnostics = validateTheme(resolved, declarations, {
    strict: true,
    knownNames,
    includeDerived: true,
  });
  diagnostics?.push(
    ...validateTheme(resolved, declarations, { strict: true, knownNames }).filter(
      (diagnostic) => diagnostic.code === "invalid-theme-value",
    ),
  );
  const localInvalidNames = new Set(
    allDiagnostics
      .filter((diagnostic) => diagnostic.severity === "error" && diagnostic.code !== "unknown-theme-variable")
      .map((diagnostic) => diagnostic.variableName)
      .filter(Boolean) as string[],
  );
  localInvalidNames.forEach((name) => invalidNames?.add(name));
  if (!localInvalidNames.size) {
    return normalizedVars;
  }
  return Object.fromEntries(
    Object.entries(normalizedVars).filter(([key]) => !localInvalidNames.has(key)),
  ) as Record<string, string>;
}

/** The compiled form of a theme, shared by every Theme with the same content — computed once per distinct theme content, tone and
 *  strictness, for one component registry, theme list and resource set. A nested `<Theme>` that only overrides a few
 *  variables used to recompile and revalidate the whole theme for every instance on the page. */
type CompiledTheme = {
  getResourceUrl: (resourceString?: string) => string | undefined;
  fontLinks: Array<string>;
  allFonts: Array<FontDef>;
  themeDefChain: ThemeDefinition[] | undefined;
  allThemeVarsWithResolvedHierarchicalVars: Record<string, string>;
  themeCssVars: Record<string, string>;
  invalidThemeVarNames: Set<string>;
  getThemeVar: (varName: string) => string | undefined;
};
const compiledThemes = new WeakMap<object, WeakMap<object, WeakMap<object, WeakMap<object, Map<string, CompiledTheme>>>>>();
const COMPILED_PER_CONTEXT = 64;
function compiledThemeKey(activeTheme: ThemeDefinition | undefined, activeTone: ThemeTone, strictTheming?: boolean, strictAccessibility?: boolean) {
  if (!activeTheme) return `none|${activeTone}`;
  // A theme's id names it for `extends`; it does not shape its compiled form — nested Themes get a generated id each.
  const { id: _id, ...content } = activeTheme;
  return `${activeTone}|${!!strictTheming}|${!!strictAccessibility}|${JSON.stringify(content)}`;
}
function cachedCompiledTheme(
  componentRegistry: ReturnType<typeof useComponentRegistry>,
  activeTheme: ThemeDefinition | undefined,
  activeTone: ThemeTone,
  themes: ThemeDefinition[],
  resources: Record<string, string>,
  resourceMap: Record<string, string>,
  strictTheming?: boolean,
  strictAccessibility?: boolean,
): CompiledTheme {
  const level = <K extends object, V>(map: WeakMap<K, V>, key: K, make: () => V) => {
    let v = map.get(key);
    if (!v) { v = make(); map.set(key, v); }
    return v;
  };
  const byKey = level(level(level(level(compiledThemes, componentRegistry as object, () => new WeakMap()), themes, () => new WeakMap()), resources, () => new WeakMap()), resourceMap, () => new Map<string, CompiledTheme>());
  const key = compiledThemeKey(activeTheme, activeTone, strictTheming, strictAccessibility);
  const hit = byKey.get(key);
  if (hit) {
    byKey.delete(key);
    byKey.set(key, hit); // most recently used last
    return hit;
  }
  const compiled = compileTheme(componentRegistry, activeTheme, activeTone, themes, resources, resourceMap, strictTheming, strictAccessibility);
  byKey.set(key, compiled);
  if (byKey.size > COMPILED_PER_CONTEXT) byKey.delete(byKey.keys().next().value!);
  return compiled;
}

/** Exported for tests: identical inputs compile to the very same object. */
export const __compiledThemeForTests = cachedCompiledTheme;

/** Names every theme may set: the root theme's, the components' declared and default ones — per registry. */
const declaredNamesCache = new WeakMap<object, Set<string>>();
function declaredNamesOf(componentRegistry: ReturnType<typeof useComponentRegistry>): Set<string> {
  let known = declaredNamesCache.get(componentRegistry as object);
  if (!known) {
    const { componentThemeVars, componentDefaultThemeVars } = componentRegistry;
    known = new Set<string>();
    Object.keys(themeVars.themeVars).forEach((name) => addKnownThemeVarName(known!, name));
    componentThemeVars.forEach((name) => addKnownThemeVarName(known!, name));
    collectThemeVarKeys(componentDefaultThemeVars).forEach((name) => addKnownThemeVarName(known!, name));
    declaredNamesCache.set(componentRegistry as object, known);
  }
  return known;
}
const layerVarsCache = new WeakMap<object, WeakMap<ThemeDefinition, Map<string, { vars: Record<string, string>; invalid: Set<string>; diagnostics: Array<ThemeDiagnostic> }>>>();

function compileTheme(
  componentRegistry: ReturnType<typeof useComponentRegistry>,
  activeTheme: ThemeDefinition | undefined,
  activeTone: ThemeTone,
  themes: ThemeDefinition[],
  resources: Record<string, string>,
  resourceMap: Record<string, string>,
  strictTheming?: boolean,
  strictAccessibility?: boolean,
): CompiledTheme {
  const { componentThemeVars, componentDefaultThemeVars, componentThemeVarDeclarations } = componentRegistry;

  const themeDefChain = (() => {
    if (activeTheme) {
      return collectThemeChainByExtends(activeTheme, themes, componentDefaultThemeVars);
    }
    return undefined;
  })();

  const allResources = (() => {
    let mergedResources: ThemeDefinition["resources"] = {};
    themeDefChain?.forEach((theme) => {
      mergedResources = {
        ...mergedResources,
        ...theme.resources,
        ...theme.tones?.[activeTone]?.resources,
      };
    });
    return {
      ...resources,
      ...mergedResources,
    };
  })();

  const allFonts = (() => {
    const ret: Array<FontDef> = [];
    Object.entries(allResources).forEach(([key, value]) => {
      if (key.startsWith("font.")) {
        ret?.push(value as FontDef);
      }
    });
    return ret;
  })();

  const getResourceUrl = (resourceString?: string) => {
      let resourceUrl = resourceString;
      if (resourceString?.startsWith("resource:")) {
        const resourceName = resourceString?.replace("resource:", "");
        resourceUrl = allResources[resourceName] as string;
      }
      if (!resourceUrl) {
        return resourceUrl;
      }
      if (resourceMap[resourceUrl]) {
        return resourceMap[resourceUrl];
      }
      if (resourceUrl.startsWith("/") && resourceMap[resourceUrl.substring(1)]) {
        return resourceMap[resourceUrl.substring(1)];
      }
      return normalizePath(resourceUrl);
    };

  const fontLinks: Array<string> = (() => {
    return (allFonts?.filter((theme) => typeof theme === "string") || []) as Array<string>;
  })();

  const declaredThemeVarNames = declaredNamesOf(componentRegistry);
  // One layer's variables in this tone, sanitized: cached per layer object (base layers are shared), the names and
  // diagnostics it reports replayed into this compile's collections.
  const layerVars = (theme: ThemeDefinition, invalidNames: Set<string>, diagnostics: Array<ThemeDiagnostic>) => {
    const slot = `${activeTone}|${!!strictTheming}`;
    let perLayer = layerVarsCache.get(componentRegistry as object)?.get(theme);
    let known = perLayer?.get(slot);
    if (!known) {
      const layerInvalid = new Set<string>();
      const layerDiagnostics: Array<ThemeDiagnostic> = [];
      const vars = sanitizeThemeVarsForStrictTheming(
        {
          ...omit(theme.themeVars, "light", "dark"),
          ...(theme.themeVars?.[activeTone] as unknown as Record<string, string>),
          ...theme.tones?.[activeTone]?.themeVars,
        },
        strictTheming,
        componentThemeVarDeclarations,
        declaredThemeVarNames,
        layerInvalid,
        layerDiagnostics,
      );
      known = { vars, invalid: layerInvalid, diagnostics: layerDiagnostics };
      let byLayer = layerVarsCache.get(componentRegistry as object);
      if (!byLayer) { byLayer = new WeakMap(); layerVarsCache.set(componentRegistry as object, byLayer); }
      if (!perLayer) { perLayer = new Map(); byLayer.set(theme, perLayer); }
      perLayer.set(slot, known);
    }
    known.invalid.forEach((name) => invalidNames.add(name));
    diagnostics.push(...known.diagnostics);
    return known.vars;
  };

  const [themeDefChainVars, layerInvalidThemeVarNames, layerThemeDiagnostics] = (() => {
    if (!themeDefChain?.length) {
      return [[], new Set<string>(), []];
    }
    let mergedThemeVars = {};
    const invalidNames = new Set<string>();
    const layerDiagnostics: Array<ThemeDiagnostic> = [];
    // Each layer once per compile (its diagnostics reported once); the list below reuses these.
    const layers = themeDefChain.map((theme) => layerVars(theme, invalidNames, layerDiagnostics));
    layers.forEach((themeVarsForTone) => {
      mergedThemeVars = {
        ...mergedThemeVars,
        ...themeVarsForTone,
      };
    });

    //we put the generated theme vars before the last item in the chain
    const resultedTheme = [
      ...layers.slice(0, themeDefChain.length - 1),
      {
        ...generateBootstrapBaseColumns(mergedThemeVars),
        ...generateBaseSpacings(mergedThemeVars),
        ...generatePaddingSegments(mergedThemeVars),
        ...generateBorderSegments(mergedThemeVars),
        ...generateBaseTones(mergedThemeVars),
        ...generateButtonTones(mergedThemeVars),
        ...generateBaseFontSizes(mergedThemeVars),
        ...generateTextFontSizes(mergedThemeVars),
      },
      layers[themeDefChain.length - 1],
    ];
    return [resultedTheme, invalidNames, layerDiagnostics];
  })();

  // Only strict theming validates names: built when it does (213 ms per page load otherwise spent for nothing).
  const knownThemeVarNames = () => {
    const known = new Set(declaredThemeVarNames);
    themeDefChainVars?.forEach((theme) => {
      const generated = {
        ...generateBootstrapBaseColumns(theme),
        ...generateBaseSpacings(theme),
        ...generatePaddingSegments(theme),
        ...generateBorderSegments(theme),
        ...generateBaseTones(theme),
        ...generateButtonTones(theme),
        ...generateBaseFontSizes(theme),
        ...generateTextFontSizes(theme),
      };
      Object.keys(generated).forEach((key) => addKnownThemeVarName(known, key));
    });
    return known;
  };

  const [allThemeVarsWithResolvedHierarchicalVars, rawAllThemeVars, invalidThemeVarNames] = (() => {
    let mergedThemeVars: Record<string, string> = {};

    themeDefChainVars?.forEach((theme) => {
      theme = generatePaddingSegments(theme);
      theme = generateBorderSegments(theme);
      mergedThemeVars = { ...mergedThemeVars, ...theme };
    });

    const resolvedThemeVarsFromChains: Record<string, string> = {};

    new Set([...Object.keys(themeVars.themeVars), ...componentThemeVars]).forEach((themeVar) => {
      const result = matchThemeVar(themeVar, themeDefChainVars);
      if (
        result &&
        result.forValue &&
        result.matchedValue &&
        result.forValue !== result.matchedValue &&
        // Only add fallback if the user hasn't explicitly defined the specific theme var
        mergedThemeVars[result.forValue] === undefined
      ) {
        resolvedThemeVarsFromChains[result.forValue] = `$${result.matchedValue}`;
      }
    });

    const rawVars = {
      ...mergedThemeVars,
      ...resolvedThemeVarsFromChains,
    };

    if (strictTheming) {
      const knownNames = knownThemeVarNames();
      const resolvedForValidation = new Map<string, string>();
      Object.keys(rawVars).forEach((key) => {
        resolvedForValidation.set(key, resolveThemeVar(key, rawVars));
      });
      const allDiags = validateTheme(
        resolvedForValidation,
        componentThemeVarDeclarations,
        { strict: !!strictTheming, knownNames, includeDerived: true },
      );
      const displayDiags = validateTheme(
        resolvedForValidation,
        componentThemeVarDeclarations,
        { strict: !!strictTheming, knownNames },
      );
      emitThemeDiagnostics([...layerThemeDiagnostics, ...displayDiags]);
      const errorVarNames = new Set(
        allDiags
          .filter((d) => d.severity === "error" && d.code !== "unknown-theme-variable")
          .map((d) => d.variableName!)
          .filter(Boolean),
      );
      const allErrorVarNames = new Set([...layerInvalidThemeVarNames, ...errorVarNames]);
      if (allErrorVarNames.size > 0) {
        const filteredRawVars = Object.fromEntries(
          Object.entries(rawVars).filter(([k]) => !allErrorVarNames.has(k)),
        );
        return [resolveThemeVarsWithCssVars(filteredRawVars), filteredRawVars, allErrorVarNames];
      }
    }

    if (import.meta.env.DEV || strictAccessibility) {
      const resolvedForContrast = new Map<string, string>();
      Object.keys(rawVars).forEach((key) => {
        resolvedForContrast.set(key, resolveThemeVar(key, rawVars));
      });
      const contrastDiags = checkThemeContrast(resolvedForContrast);
      for (const d of contrastDiags) {
        pushXsLog({
          kind: "a11y",
          ts: Date.now(),
          severity: strictAccessibility ? "error" : d.severity,
          code: d.code,
          componentName: d.componentName,
          message: d.message,
          fix: d.fix,
        });
        if (strictAccessibility) {
          console.error(`[XMLUI Accessibility] ${d.message}`);
        }
      }
    }

    return [resolveThemeVarsWithCssVars(rawVars), rawVars, new Set<string>()];
  })();

  const themeCssVars = (() => {
    const ret: Record<string, string> = {};
    Object.entries(allThemeVarsWithResolvedHierarchicalVars).forEach(([key, value]) => {
      const themeKey = `--${themeVars.keyPrefix}-${key}`;
      if (value) {
        ret[themeKey] = value;
      }
    });
    return ret;
  })();

  const getThemeVar = (varName: string) => {
      return resolveThemeVar(varName, rawAllThemeVars);
    };

  return { getResourceUrl, fontLinks, allFonts, themeDefChain, allThemeVarsWithResolvedHierarchicalVars, themeCssVars, invalidThemeVarNames, getThemeVar };
}

export function useCompiledTheme(
  activeTheme: ThemeDefinition | undefined,
  activeTone: ThemeTone,
  themes: ThemeDefinition[] = EMPTY_ARRAY,
  resources: Record<string, string> = EMPTY_OBJECT,
  resourceMap: Record<string, string> = EMPTY_OBJECT,
  strictTheming?: boolean,
  strictAccessibility?: boolean,
) {
  const componentRegistry = useComponentRegistry();
  const { getResourceUrl, fontLinks, allFonts, themeDefChain, allThemeVarsWithResolvedHierarchicalVars, themeCssVars, invalidThemeVarNames, getThemeVar } = useMemo(
    () => cachedCompiledTheme(componentRegistry, activeTheme, activeTone, themes, resources, resourceMap, strictTheming, strictAccessibility),
    [componentRegistry, activeTheme, activeTone, themes, resources, resourceMap, strictTheming, strictAccessibility],
  );

  useEffect(() => {
    allFonts.forEach(async (font) => {
      if (typeof font !== "string") {
        const resolvedSrc = getResourceUrl(font.src);
        let src = `url(${resolvedSrc})`;
        if (font.format) {
          src = `${src} format('${font.format}')`;
        }
        const ff = new FontFace(font.fontFamily, src, {
          weight: font.fontWeight,
          style: font.fontStyle,
          display: font.fontDisplay as any,
        });
        try {
          const loadedFontFace = await ff.load();
          document.fonts.add(loadedFontFace);
        } catch (e) {
          console.error("loading fonts failed", e);
        }
      }
    });
  }, [themeDefChain, getResourceUrl, allFonts]);

  return {
    getResourceUrl,
    fontLinks,
    allThemeVarsWithResolvedHierarchicalVars,
    themeCssVars,
    invalidThemeVarNames,
    getThemeVar,
  };
}

export const builtInThemes: Array<ThemeDefinition> = [
  XmlUiThemeDefinition,
  XmlUiGreenThemeDefinition,
  XmlUiGrayThemeDefinition,
  XmlUiOrangeThemeDefinition,
  XmlUiPurpleThemeDefinition,
  XmlUiCyanThemeDefinition,
  XmlUiRedThemeDefinition,
  XmlUiBlogThemeDefinition,
  XmlUiWebThemeDefinition,
  /*SolidThemeDefinition,*/
];

type ThemeProviderProps = {
  children?: React.ReactNode;
  themes?: Array<ThemeDefinition>;
  defaultTheme?: string;
  defaultTone?: ThemeTone;
  resources?: Record<string, string>;
  resourceMap?: Record<string, string>;
  localThemes?: Record<string, string>;
  strictTheming?: boolean;
  strictAccessibility?: boolean;
};

// theme-overriding properties change.
function ThemeProvider({
  children,
  themes: custThemes = EMPTY_ARRAY,
  defaultTheme = "xmlui",
  defaultTone = "light",
  resources = EMPTY_OBJECT,
  resourceMap = EMPTY_OBJECT,
  localThemes = EMPTY_OBJECT,
  strictTheming,
  strictAccessibility,
}: ThemeProviderProps) {
  const [activeThemeTone, setActiveThemeTone] = useState<ThemeTone>(() => {
    if (!defaultTone) {
      return ThemeToneKeys[0];
    }
    return defaultTone;
  });

  // Sync activeThemeTone when defaultTone CHANGES after mount.
  // The initial value is already set synchronously by useState above, so we
  // skip the first run to avoid overriding a tone that was set programmatically
  // (e.g., restored from localStorage by the App component's init effect).
  const isToneInitialMount = useRef(true);
  useEffect(() => {
    if (isToneInitialMount.current) {
      isToneInitialMount.current = false;
      return;
    }
    if (defaultTone) {
      setActiveThemeTone(defaultTone);
    }
  }, [defaultTone]);

  const themes: Array<ThemeDefinition> = useMemo(() => {
    return [...custThemes, ...builtInThemes];
  }, [custThemes]);

  const availableThemeIds = useMemo(() => {
    return [...new Set(themes.map((theme) => theme.id))];
  }, [themes]);

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    if (!defaultTheme) {
      return availableThemeIds[0];
    }
    return defaultTheme;
  });

  // Sync activeThemeId when defaultTheme or availableThemeIds change (HMR use case).
  // - Skip the first run (initial value already set by useState).
  // - When only availableThemeIds changes (async theme loading in standalone mode),
  //   do NOT reset — that would override a theme restored from localStorage by App.
  // - Only reset when defaultTheme itself changes (explicit prop update / HMR).
  const prevDefaultThemeRef = useRef(defaultTheme);
  const isThemeInitialMount = useRef(true);
  useIsomorphicLayoutEffect(() => {
    const prevDefault = prevDefaultThemeRef.current;
    prevDefaultThemeRef.current = defaultTheme;

    if (isThemeInitialMount.current) {
      isThemeInitialMount.current = false;
      return;
    }

    // availableThemeIds changed but defaultTheme is the same → do nothing
    if (prevDefault === defaultTheme) return;

    // defaultTheme changed (HMR or prop update) → sync to new default
    if (defaultTheme && availableThemeIds.includes(defaultTheme)) {
      setActiveThemeId(defaultTheme);
    } else {
      setActiveThemeId(availableThemeIds[0]);
    }
  }, [availableThemeIds, defaultTheme]);

  const activeTheme: ThemeDefinition = useMemo(() => {
    let foundTheme: ThemeDefinition;
    if (activeThemeId) {
      foundTheme = themes.find((theme) => theme.id === activeThemeId);
    }
    if (!foundTheme) {
      const fallbackId = availableThemeIds[0];
      foundTheme = themes.find((theme) => theme.id === fallbackId);
      console.error(
        `[XMLUI] Unknown theme "${activeThemeId}". Falling back to "${fallbackId}". Available themes: ${availableThemeIds.join(", ")}.`,
      );
      if (!foundTheme) {
        throw new Error(
          `Theme "${activeThemeId}" not found and no fallback themes are available.`,
        );
      }
    }
    return foundTheme;
  }, [activeThemeId, availableThemeIds, themes]);

  const { allThemeVarsWithResolvedHierarchicalVars, themeCssVars, getResourceUrl, getThemeVar } =
    useCompiledTheme(activeTheme, activeThemeTone, themes, resources, resourceMap, strictTheming, strictAccessibility);

  const domRoot = useDomRoot();
  const [root, setRoot] = useState(null);

  useIsomorphicLayoutEffect(() => {
    if (typeof document !== "undefined") {
      if (domRoot instanceof ShadowRoot) {
        let portalContainer = domRoot.getElementById("nested-app-portal-root");
        if (!portalContainer) {
          portalContainer = document.createElement("div");
          portalContainer.id = "nested-app-portal-root";
        }
        // Always (re-)append so the portal container is the last child of the
        // shadow root.  After a NestedApp reset the React-managed #nested-app-root
        // is removed and recreated, which can leave the portal container earlier in
        // the DOM than the new app root — causing portalled content (dropdowns,
        // tooltips) to render behind the app.
        domRoot.appendChild(portalContainer);
        setRoot(portalContainer);
      } else {
        setRoot(document.body);
      }
    }
  }, [domRoot]);

  const themeValue = useMemo(() => {
    const themeVal: AppThemes = {
      themes,
      resources,
      resourceMap,
      activeThemeId,
      activeThemeTone,
      setActiveThemeId,
      setActiveThemeTone,
      availableThemeIds,
      activeTheme,
      toggleThemeTone: () => setActiveThemeTone(activeThemeTone === "light" ? "dark" : "light"),
    };
    return themeVal;
  }, [
    activeTheme,
    activeThemeId,
    activeThemeTone,
    availableThemeIds,
    resourceMap,
    resources,
    themes,
  ]);

  const currentThemeContextValue = useMemo(() => {
    const themeVal: ThemeScope = {
      root,
      setRoot,
      activeThemeId,
      activeThemeTone: activeThemeTone,
      activeTheme,
      themeStyles: themeCssVars,
      themeVars: allThemeVarsWithResolvedHierarchicalVars,
      getResourceUrl,
      getThemeVar,
    };
    return themeVal;
  }, [
    activeTheme,
    activeThemeId,
    activeThemeTone,
    allThemeVarsWithResolvedHierarchicalVars,
    getResourceUrl,
    getThemeVar,
    root,
    themeCssVars,
  ]);

  return (
    <ThemesContext.Provider value={themeValue}>
      <ThemeContext.Provider value={currentThemeContextValue}>{children}</ThemeContext.Provider>
    </ThemesContext.Provider>
  );
}

function resolveThemeVarsWithCssVars(theme?: Record<string, string>) {
  if (!theme) {
    return {};
  }
  const ret: Record<string, string> = {};
  Object.keys(theme).forEach((key) => {
    ret[key] = resolveThemeVarToCssVars(key, theme);
  });
  return ret;

  function resolveThemeVarToCssVars(varName: string, theme: Record<string, string>) {
    // Shared with the inline-<Theme> path in ThemeReact: one definition of how a
    // `$token` reference becomes a CSS var, so the two cannot diverge again.
    return replaceThemeVarRefs(theme[varName]);
  }
}

export default ThemeProvider;
