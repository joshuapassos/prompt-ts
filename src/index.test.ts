import { describe, expect, it } from "vitest";
import { type ArrayToObject, prompt, promptSection } from "./index.js";

// ============================================================
// Type-level test helpers
// ============================================================
type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ============================================================
// 1. Type-level tests — ExtractNewTypes + Trim + ArrayToObject
//    These tests run at compile time. If a type assertion is
//    wrong, TypeScript will emit an error on the `Expect` line.
// ============================================================

describe("type-level tests (compile-time)", () => {
  it("extracts a single placeholder", () => {
    const p = prompt("test", { en: "Hello {{name}}" } as const, { en: "Hi" } as const);

    // userOptions not needed — user template has no placeholders
    const result = p.render("en", {
      systemOptions: { name: "Alice" },
    });

    expect(result.systemPrompt).toBe("Hello Alice");
  });

  it("extracts multiple placeholders", () => {
    const p = prompt(
      "test",
      { en: "{{greeting}} {{name}}, welcome to {{place}}" } as const,
      { en: "No vars" } as const,
    );

    const result = p.render("en", {
      systemOptions: { greeting: "Hello", name: "Bob", place: "Wonderland" },
    });

    expect(result.systemPrompt).toBe("Hello Bob, welcome to Wonderland");
  });

  it("extracts placeholders with spaces (Trim)", () => {
    const p = prompt("test", { en: "Hello {{ name }}" } as const, { en: "Age: {{ age }}" } as const);

    const result = p.render("en", {
      systemOptions: { name: "Alice" },
      userOptions: { age: 30 },
    });

    expect(result.systemPrompt).toBe("Hello Alice");
    expect(result.userPrompt).toBe("Age: 30");
  });

  it("handles no placeholders — options should be empty objects", () => {
    const p = prompt("test", { en: "Hello world" } as const, { en: "Just text" } as const);

    const result = p.render("en", {
      systemOptions: {},
      userOptions: {},
    });

    expect(result.systemPrompt).toBe("Hello world");
    expect(result.userPrompt).toBe("Just text");
  });

  // Type-only: ArrayToObject produces correct shape
  it("ArrayToObject maps tuple to object type", () => {
    type Result = ArrayToObject<["name", "age"]>;
    type _Check = Expect<Equal<Result, { name: string | number | boolean; age: string | number | boolean }>>;
  });

  it("works with non-literal string types (Prompt from Record<string, string>)", () => {
    // When LanguageMap values are plain `string` (not literal), placeholders
    // can't be extracted at type-level. Options should degrade to optional,
    // not produce `never` which would make the class unusable.
    const templates: Record<string, string> = {
      en: "Hello {{name}}",
    };

    const p = prompt("dynamic", templates, templates);

    // Should compile — non-literal strings can't enforce required options
    const result = p.render("en");
    expect(result.systemPrompt).toBe("Hello {{name}}");
  });
});

// ============================================================
// 2. Runtime tests — render substitution logic
// ============================================================

describe("Prompt.render — runtime behavior", () => {
  it("replaces system and user placeholders independently", () => {
    const p = prompt(
      "classify",
      { pt: "Você é um classificador de {{category}}" } as const,
      { pt: "Classifique: {{text}}" } as const,
    );

    const result = p.render("pt", {
      systemOptions: { category: "sentimentos" },
      userOptions: { text: "Estou feliz" },
    });

    expect(result.systemPrompt).toBe("Você é um classificador de sentimentos");
    expect(result.userPrompt).toBe("Classifique: Estou feliz");
  });

  it("replaces repeated placeholders in the same template", () => {
    const p = prompt("repeat", { en: "{{name}} is {{name}}" } as const, { en: "ok" } as const);

    const result = p.render("en", {
      systemOptions: { name: "Bob" },
    });

    expect(result.systemPrompt).toBe("Bob is Bob");
  });

  it("coerces numbers and booleans to string", () => {
    const p = prompt("coerce", { en: "Count: {{count}}, Active: {{active}}" } as const, { en: "none" } as const);

    const result = p.render("en", {
      systemOptions: { count: 42, active: true },
    });

    expect(result.systemPrompt).toBe("Count: 42, Active: true");
  });

  it("supports multiple languages with different placeholders", () => {
    const p = prompt(
      "multi",
      {
        en: "Hello {{name}}",
        pt: "Olá {{nome}}",
      } as const,
      {
        en: "How are you?",
        pt: "Como vai?",
      } as const,
    );

    const resultEn = p.render("en", {
      systemOptions: { name: "Alice" },
    });

    const resultPt = p.render("pt", {
      systemOptions: { nome: "Alice" },
    });

    expect(resultEn.systemPrompt).toBe("Hello Alice");
    expect(resultPt.systemPrompt).toBe("Olá Alice");
  });

  it("returns original string when options is undefined (no placeholders)", () => {
    const p = prompt("static", { en: "Static system" } as const, { en: "Static user" } as const);

    const result = p.render("en");

    expect(result.systemPrompt).toBe("Static system");
    expect(result.userPrompt).toBe("Static user");
  });

  it("requires options when template has placeholders", () => {
    const p = prompt("required", { en: "Hello {{name}}" } as const, { en: "ok" } as const);

    // @ts-expect-error — options is now required when there are placeholders
    p.render("en");

    // Correct usage — userOptions not needed since user template has no placeholders
    const result = p.render("en", {
      systemOptions: { name: "Alice" },
    });

    expect(result.systemPrompt).toBe("Hello Alice");
  });
});

// ============================================================
// 3. Conditional options — systemOptions/userOptions independent
// ============================================================

describe("Prompt.render — conditional options (gap 3)", () => {
  it("only requires userOptions when only user template has placeholders", () => {
    const p = prompt("user-only", { en: "You are a helper" } as const, { en: "Summarize: {{text}}" } as const);

    const result = p.render("en", {
      userOptions: { text: "Some long text" },
    });

    expect(result.systemPrompt).toBe("You are a helper");
    expect(result.userPrompt).toBe("Summarize: Some long text");
  });

  it("only requires systemOptions when only system template has placeholders", () => {
    const p = prompt("system-only", { en: "You are a {{role}}" } as const, { en: "Do something" } as const);

    const result = p.render("en", {
      systemOptions: { role: "translator" },
    });

    expect(result.systemPrompt).toBe("You are a translator");
    expect(result.userPrompt).toBe("Do something");
  });

  it("requires both when both templates have placeholders", () => {
    const p = prompt("both", { en: "You are a {{role}}" } as const, { en: "Translate: {{text}}" } as const);

    // @ts-expect-error — missing userOptions
    p.render("en", { systemOptions: { role: "translator" } });

    // @ts-expect-error — missing systemOptions
    p.render("en", { userOptions: { text: "hello" } });

    const result = p.render("en", {
      systemOptions: { role: "translator" },
      userOptions: { text: "hello" },
    });

    expect(result.systemPrompt).toBe("You are a translator");
    expect(result.userPrompt).toBe("Translate: hello");
  });
});

// ============================================================
// 4. Edge cases
// ============================================================

describe("Prompt — edge cases", () => {
  it("handles empty string templates", () => {
    const p = prompt("empty", { en: "" } as const, { en: "" } as const);

    const result = p.render("en", {
      systemOptions: {},
      userOptions: {},
    });

    expect(result.systemPrompt).toBe("");
    expect(result.userPrompt).toBe("");
  });

  it("handles placeholders adjacent to each other", () => {
    const p = prompt("adjacent", { en: "{{first}}{{second}}" } as const, { en: "ok" } as const);

    const result = p.render("en", {
      systemOptions: { first: "A", second: "B" },
    });

    expect(result.systemPrompt).toBe("AB");
  });

  it("handles template with only a placeholder", () => {
    const p = prompt("only-var", { en: "{{value}}" } as const, { en: "{{other}}" } as const);

    const result = p.render("en", {
      systemOptions: { value: "hello" },
      userOptions: { other: "world" },
    });

    expect(result.systemPrompt).toBe("hello");
    expect(result.userPrompt).toBe("world");
  });

  it("preserves promptName and zodSchema", () => {
    const p = prompt("my-prompt", { en: "sys" } as const, { en: "usr" } as const);

    expect(p.promptName).toBe("my-prompt");
    expect(p.zodSchema).toBeUndefined();
  });

  it("handles special regex characters in placeholder values", () => {
    const p = prompt("regex", { en: "Pattern: {{pattern}}" } as const, { en: "ok" } as const);

    const result = p.render("en", {
      systemOptions: { pattern: "$100.00 (USD)" },
    });

    expect(result.systemPrompt).toBe("Pattern: $100.00 (USD)");
  });
});

// ============================================================
// 5. Falsy value handling — guards against `vars[key]` instead of `key in vars`
//    If replacePlaceholders used truthiness check instead of `in` operator,
//    falsy values like 0, false, and "" would NOT be replaced.
// ============================================================

describe("replacePlaceholders — falsy values must be replaced", () => {
  it("replaces placeholder with 0 (number zero)", () => {
    const p = prompt("falsy", { en: "Count: {{count}}" } as const, { en: "ok" } as const);

    const result = p.render("en", {
      systemOptions: { count: 0 },
    });

    expect(result.systemPrompt).toBe("Count: 0");
  });

  it("replaces placeholder with false (boolean)", () => {
    const p = prompt("falsy", { en: "Active: {{active}}" } as const, { en: "ok" } as const);

    const result = p.render("en", {
      systemOptions: { active: false },
    });

    expect(result.systemPrompt).toBe("Active: false");
  });

  it("replaces placeholder with empty string", () => {
    const s = promptSection("Name: [{{name}}]" as const);
    expect(s.render({ name: "" })).toBe("Name: []");
  });

  it("handles falsy values in both system and user templates", () => {
    const p = prompt("falsy-both", "Retries: {{retries}}" as const, "Debug: {{debug}}" as const);

    const result = p.render({
      systemOptions: { retries: 0 },
      userOptions: { debug: false },
    });

    expect(result.systemPrompt).toBe("Retries: 0");
    expect(result.userPrompt).toBe("Debug: false");
  });

  it("section handles 0 and false as placeholder values", () => {
    const s = promptSection("Min: {{min}}, Max: {{max}}, Enabled: {{enabled}}" as const);
    expect(s.render({ min: 0, max: 100, enabled: false })).toBe("Min: 0, Max: 100, Enabled: false");
  });
});

// ============================================================
// 6. promptSection() — composable prompt fragments
// ============================================================

describe("promptSection() — type-safe prompt fragments", () => {
  it("renders a single placeholder", () => {
    const persona = promptSection("You are a {{role}}." as const);
    expect(persona.render({ role: "translator" })).toBe("You are a translator.");
  });

  it("renders multiple placeholders", () => {
    const intro = promptSection("You are a {{role}} specialized in {{domain}}." as const);
    expect(intro.render({ role: "engineer", domain: "databases" })).toBe(
      "You are a engineer specialized in databases.",
    );
  });

  it("renders without args when no placeholders", () => {
    const static_ = promptSection("Always be concise." as const);
    expect(static_.render()).toBe("Always be concise.");
  });

  it("handles spaces in placeholders", () => {
    const s = promptSection("Hello {{ name }}!" as const);
    expect(s.render({ name: "Alice" })).toBe("Hello Alice!");
  });

  it("coerces numbers and booleans", () => {
    const s = promptSection("Max {{count}} words. Strict: {{strict}}" as const);
    expect(s.render({ count: 200, strict: true })).toBe("Max 200 words. Strict: true");
  });

  it("preserves original template string", () => {
    const s = promptSection("Template {{var}}" as const);
    expect(s.template).toBe("Template {{var}}");
  });

  it("requires vars when placeholders exist", () => {
    const s = promptSection("Hello {{name}}" as const);

    // @ts-expect-error — vars is required when there are placeholders
    s.render();

    expect(s.render({ name: "Bob" })).toBe("Hello Bob");
  });
});

// ============================================================
// 7. promptSection() + Prompt — composition pattern
// ============================================================

describe("promptSection() + Prompt — composition", () => {
  it("composes multiple sections into a Prompt system prompt", () => {
    const persona = promptSection("You are a {{role}}." as const);
    const constraints = promptSection("Always respond in {{language}}. Max {{maxWords}} words." as const);
    const tone = promptSection("Be professional and concise." as const);

    const systemPrompt = [
      persona.render({ role: "translator" }),
      constraints.render({ language: "Portuguese", maxWords: 200 }),
      tone.render(),
    ].join("\n\n");

    const p = prompt("translate", { en: systemPrompt } as const, { en: "Translate: {{text}}" } as const);

    const result = p.render("en", {
      userOptions: { text: "Hello world" },
    });

    expect(result.systemPrompt).toBe(
      "You are a translator.\n\nAlways respond in Portuguese. Max 200 words.\n\nBe professional and concise.",
    );
    expect(result.userPrompt).toBe("Translate: Hello world");
  });

  it("reuses the same section across different prompts", () => {
    const persona = promptSection("You are a {{role}}." as const);

    const translatorSys = persona.render({ role: "translator" });
    const reviewerSys = persona.render({ role: "code reviewer" });

    expect(translatorSys).toBe("You are a translator.");
    expect(reviewerSys).toBe("You are a code reviewer.");
  });

  it("composes sections for multi-language prompts", () => {
    const personaPt = promptSection("Você é um {{role}}." as const);
    const personaEn = promptSection("You are a {{role}}." as const);

    const p = prompt(
      "multi",
      {
        pt: personaPt.render({ role: "tradutor" }),
        en: personaEn.render({ role: "translator" }),
      } as const,
      {
        pt: "Traduza: {{text}}" as const,
        en: "Translate: {{text}}" as const,
      } as const,
    );

    const resultPt = p.render("pt", { userOptions: { text: "Hello" } });
    const resultEn = p.render("en", { userOptions: { text: "Olá" } });

    expect(resultPt.systemPrompt).toBe("Você é um tradutor.");
    expect(resultPt.userPrompt).toBe("Traduza: Hello");
    expect(resultEn.systemPrompt).toBe("You are a translator.");
    expect(resultEn.userPrompt).toBe("Translate: Olá");
  });
});

// ============================================================
// 8. String mode — no lang parameter
// ============================================================

describe("Prompt — string mode (no lang)", () => {
  it("accepts plain strings and render works without lang", () => {
    const p = prompt("simple", "You are a {{role}}." as const, "Do: {{task}}" as const);

    const result = p.render({
      systemOptions: { role: "helper" },
      userOptions: { task: "summarize" },
    });

    expect(result.systemPrompt).toBe("You are a helper.");
    expect(result.userPrompt).toBe("Do: summarize");
  });

  it("works without options when no placeholders", () => {
    const p = prompt("static", "You are helpful." as const, "Hello." as const);

    const result = p.render();

    expect(result.systemPrompt).toBe("You are helpful.");
    expect(result.userPrompt).toBe("Hello.");
  });

  it("requires options when string templates have placeholders", () => {
    const p = prompt("required", "Hello {{name}}" as const, "ok" as const);

    // @ts-expect-error — options required because system has placeholders
    p.render();

    const result = p.render({
      systemOptions: { name: "Alice" },
    });

    expect(result.systemPrompt).toBe("Hello Alice");
  });

  it("handles systemOptions/userOptions independently in string mode", () => {
    const p = prompt("mixed", "Static system" as const, "Query: {{query}}" as const);

    const result = p.render({
      userOptions: { query: "hello" },
    });

    expect(result.systemPrompt).toBe("Static system");
    expect(result.userPrompt).toBe("Query: hello");
  });

  it("works with section composition in string mode", () => {
    const persona = promptSection("You are a {{role}}." as const);
    const tone = promptSection("Be concise." as const);

    const sys = [persona.render({ role: "analyst" }), tone.render()].join("\n\n");

    const p = prompt("composed", sys as typeof sys, "Analyze: {{text}}" as const);

    const result = p.render({
      userOptions: { text: "some data" },
    });

    expect(result.systemPrompt).toBe("You are a analyst.\n\nBe concise.");
    expect(result.userPrompt).toBe("Analyze: some data");
  });

  it("coerces numbers and booleans in string mode", () => {
    const p = prompt("coerce", "Max {{count}} tokens. Strict: {{strict}}" as const, "Go" as const);

    const result = p.render({
      systemOptions: { count: 1000, strict: true },
    });

    expect(result.systemPrompt).toBe("Max 1000 tokens. Strict: true");
  });
});

// ============================================================
// 9. Language key matching — system and user must share keys
// ============================================================

describe("prompt() — language key matching", () => {
  it("errors when user template is missing a language from system", () => {
    prompt(
      "mismatch",
      { en: "Hello", pt: "Olá" } as const,
      // @ts-expect-error — user template missing "pt" key
      { en: "Hi" } as const,
    );
  });

  it("accepts matching language keys", () => {
    const p = prompt("match", { en: "Hello {{name}}", pt: "Olá {{nome}}" } as const, { en: "Hi", pt: "Oi" } as const);

    expect(p.render("en", { systemOptions: { name: "Alice" } }).systemPrompt).toBe("Hello Alice");
    expect(p.render("pt", { systemOptions: { nome: "Bob" } }).systemPrompt).toBe("Olá Bob");
  });

  it("does not affect string mode (both strings)", () => {
    const p = prompt("str", "System" as const, "User" as const);
    expect(p.render().systemPrompt).toBe("System");
  });
});
