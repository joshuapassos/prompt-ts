import type z from "zod";

type ExtractNewTypes<S extends string> = S extends `${string}{{${infer Key}}}${infer Rest}`
  ? [Trim<Key>, ...ExtractNewTypes<Rest>]
  : [];

type Separator = " ";

type Trim<T extends string, Acc extends string = ""> = T extends `${infer Char}${infer Rest}`
  ? Char extends Separator
    ? Trim<Rest, Acc>
    : Trim<Rest, `${Acc}${Char}`>
  : Acc;

export type ArrayToObject<T extends string[]> = {
  [K in T[number]]: string | number | boolean;
};

type IsEmpty<T extends unknown[]> = T extends [] ? true : false;

type OptionsField<Keys extends string[]> = IsEmpty<Keys> extends true ? Record<string, never> : ArrayToObject<Keys>;

type OptionalField<Keys extends string[]> = IsEmpty<Keys> extends true ? true : false;

type EvalOptions<STemplate extends string, UTemplate extends string> = {
  [K in "systemOptions" as OptionalField<ExtractNewTypes<STemplate>> extends true ? never : K]: OptionsField<
    ExtractNewTypes<STemplate>
  >;
} & {
  [K in "userOptions" as OptionalField<ExtractNewTypes<UTemplate>> extends true ? never : K]: OptionsField<
    ExtractNewTypes<UTemplate>
  >;
} & {
  [K in "systemOptions" as OptionalField<ExtractNewTypes<STemplate>> extends true ? K : never]?: OptionsField<
    ExtractNewTypes<STemplate>
  >;
} & {
  [K in "userOptions" as OptionalField<ExtractNewTypes<UTemplate>> extends true ? K : never]?: OptionsField<
    ExtractNewTypes<UTemplate>
  >;
};

type HasAnyPlaceholders<STemplate extends string, UTemplate extends string> = [
  IsEmpty<ExtractNewTypes<STemplate>>,
  IsEmpty<ExtractNewTypes<UTemplate>>,
] extends [true, true]
  ? false
  : true;

type EvalArgs<STemplate extends string, UTemplate extends string> =
  HasAnyPlaceholders<STemplate, UTemplate> extends false
    ? [options?: EvalOptions<STemplate, UTemplate>]
    : [options: EvalOptions<STemplate, UTemplate>];

export type PromptTemplate = string | Record<string, string>;

type NormalizeTemplate<T extends PromptTemplate> = T extends string ? { default: T } : T;

type GetTemplate<T extends PromptTemplate, K extends string> = T extends string ? T : K extends keyof T ? T[K] : never;

type StringTemplate<T extends PromptTemplate, K extends string> =
  GetTemplate<T, K> extends string ? GetTemplate<T, K> : never;

type SectionArgs<T extends string> =
  IsEmpty<ExtractNewTypes<T>> extends true ? [vars?: Record<string, never>] : [vars: ArrayToObject<ExtractNewTypes<T>>];

function replacePlaceholders(template: string, vars: Record<string, unknown> | undefined) {
  return template.replaceAll(/\{\{([^}]+)\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    return vars && key in vars ? String(vars[key]) : match;
  });
}

/**
 * Creates a reusable, type-safe prompt fragment with `{{placeholder}}` interpolation.
 *
 * @example
 * ```ts
 * const persona = promptSection("You are a {{role}}." as const);
 * persona.render({ role: "translator" }); // "You are a translator."
 * ```
 */
export function promptSection<T extends string>(template: T) {
  return {
    template,
    render(...args: SectionArgs<T>) {
      return replacePlaceholders(template, args[0] as Record<string, unknown> | undefined);
    },
  };
}

/**
 * Type-safe prompt template with system/user message pairs and optional Zod schema for structured output.
 *
 * Supports two modes:
 * - **String mode** — pass plain strings as templates, call `render()` without a language key.
 * - **Multi-language mode** — pass `Record<string, string>` maps, call `render(lang, options)`.
 *
 * Placeholders use the `{{key}}` syntax and are fully type-checked at compile time.
 *
 * @example
 * ```ts
 * const p = prompt("greet", "Hello {{name}}" as const, "Hi!" as const);
 * p.render({ systemOptions: { name: "Alice" } });
 * // => { systemPrompt: "Hello Alice", userPrompt: "Hi!" }
 * ```
 */
export function prompt<S extends PromptTemplate, U extends PromptTemplate, T = unknown>(
  promptName: string,
  systemPrompt: S,
  userPrompt: U,
  zodSchema?: z.ZodType<T>,
) {
  const normalizedSystem = (
    typeof systemPrompt === "string" ? { default: systemPrompt } : systemPrompt
  ) as NormalizeTemplate<S>;

  const normalizedUser = (
    typeof userPrompt === "string" ? { default: userPrompt } : userPrompt
  ) as NormalizeTemplate<U>;

  return {
    promptName,
    zodSchema,
    render<
      TLang extends keyof NormalizeTemplate<S> & keyof NormalizeTemplate<U> = keyof NormalizeTemplate<S> &
        keyof NormalizeTemplate<U>,
    >(
      ...args: [S, U] extends [string, string]
        ? EvalArgs<S extends string ? S : never, U extends string ? U : never>
        : [lang: TLang, ...EvalArgs<StringTemplate<S, TLang & string>, StringTemplate<U, TLang & string>>]
    ) {
      let lang: string;
      let evalOptions: Record<string, unknown>;

      if (typeof args[0] === "string") {
        lang = args[0] as string;
        evalOptions = (args[1] ?? {}) as Record<string, unknown>;
      } else {
        lang = "default";
        evalOptions = (args[0] ?? {}) as Record<string, unknown>;
      }

      const systemOptions = evalOptions.systemOptions as Record<string, unknown> | undefined;
      const userOptions = evalOptions.userOptions as Record<string, unknown> | undefined;

      const sys = replacePlaceholders(
        (normalizedSystem as Record<string, string>)[lang] as string,
        systemOptions,
      );

      const usr = replacePlaceholders((normalizedUser as Record<string, string>)[lang] as string, userOptions);

      return { systemPrompt: sys, userPrompt: usr };
    },
  };
}
