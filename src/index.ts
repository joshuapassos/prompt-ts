import type z from "zod";

type Whitespace = " " | "\t" | "\n";

type TrimLeft<T extends string> = T extends `${Whitespace}${infer R}` ? TrimLeft<R> : T;
type TrimRight<T extends string> = T extends `${infer R}${Whitespace}` ? TrimRight<R> : T;
type Trim<T extends string> = TrimLeft<TrimRight<T>>;

// Extract up to 5 keys per recursion level to stay within TS depth limits (~50).
// This supports up to ~250 placeholders per template.
type ExtractKeys<S extends string> = S extends `${string}{{${infer K1}}}${infer R1}`
  ? R1 extends `${string}{{${infer K2}}}${infer R2}`
    ? R2 extends `${string}{{${infer K3}}}${infer R3}`
      ? R3 extends `${string}{{${infer K4}}}${infer R4}`
        ? R4 extends `${string}{{${infer K5}}}${infer R5}`
          ? Trim<K1> | Trim<K2> | Trim<K3> | Trim<K4> | Trim<K5> | ExtractKeys<R5>
          : Trim<K1> | Trim<K2> | Trim<K3> | Trim<K4>
        : Trim<K1> | Trim<K2> | Trim<K3>
      : Trim<K1> | Trim<K2>
    : Trim<K1>
  : never;

export type KeysToObject<Keys extends string> = {
  [K in Keys]: string | number | boolean;
};

type EvalOptions<STemplate extends string, UTemplate extends string> = ([ExtractKeys<STemplate>] extends [never]
  ? { systemOptions?: Record<string, never> }
  : { systemOptions: KeysToObject<ExtractKeys<STemplate>> }) &
  ([ExtractKeys<UTemplate>] extends [never]
    ? { userOptions?: Record<string, never> }
    : { userOptions: KeysToObject<ExtractKeys<UTemplate>> });

type HasAnyPlaceholders<STemplate extends string, UTemplate extends string> = [
  ExtractKeys<STemplate> | ExtractKeys<UTemplate>,
] extends [never]
  ? false
  : true;

type EvalArgs<STemplate extends string, UTemplate extends string> =
  HasAnyPlaceholders<STemplate, UTemplate> extends false
    ? [options?: EvalOptions<STemplate, UTemplate>]
    : [options: EvalOptions<STemplate, UTemplate>];

export type PromptTemplate = string | Record<string, string>;

type MatchLanguages<S extends PromptTemplate> = S extends string ? PromptTemplate : Record<keyof S & string, string>;

type NormalizeTemplate<T extends PromptTemplate> = T extends string ? { default: T } : T;

type GetTemplate<T extends PromptTemplate, K extends string> = T extends string ? T : K extends keyof T ? T[K] : never;

type StringTemplate<T extends PromptTemplate, K extends string> =
  GetTemplate<T, K> extends string ? GetTemplate<T, K> : never;

type SectionArgs<T extends string> = [ExtractKeys<T>] extends [never]
  ? [vars?: Record<string, never>]
  : [vars: KeysToObject<ExtractKeys<T>>];

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
export function promptSection<const T extends string>(template: T) {
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
export function prompt<const S extends PromptTemplate, const U extends MatchLanguages<S>, T = unknown>(
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

      const sys = replacePlaceholders((normalizedSystem as Record<string, string>)[lang] as string, systemOptions);

      const usr = replacePlaceholders((normalizedUser as Record<string, string>)[lang] as string, userOptions);

      return { systemPrompt: sys, userPrompt: usr };
    },
  };
}
