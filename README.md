# @joshuapassos/prompt-ts

Type-safe prompt templating engine for TypeScript. Build structured LLM prompts with compile-time placeholder validation, multi-language support, and optional Zod schema integration.

## Install

```bash
pnpm add @joshuapassos/prompt-ts
```

## Features

- **Type-safe placeholders** — `{{key}}` syntax validated at compile time
- **System/User message pairs** — structured prompt rendering for chat-based LLMs
- **Multi-language support** — define templates per language, select at render time
- **Composable sections** — reusable prompt fragments via `promptSection()`
- **Zod schema** — optional structured output validation
- **Conditional options** — only requires `systemOptions`/`userOptions` when the corresponding template has placeholders

## Usage

### Basic (string mode)

```ts
import { prompt } from "@joshuapassos/prompt-ts";

const p = prompt(
  "greet",
  "You are a {{role}}.",
  "Say hello to {{name}}."
);

const result = p.render({
  systemOptions: { role: "assistant" },
  userOptions: { name: "Alice" },
});
// => { systemPrompt: "You are a assistant.", userPrompt: "Say hello to Alice." }
```

### Multi-language mode

```ts
const p = prompt(
  "classify",
  {
    en: "You are a {{category}} classifier",
    pt: "Você é um classificador de {{categoria}}",
  },
  {
    en: "Classify: {{text}}",
    pt: "Classifique: {{texto}}",
  }
);

p.render("en", {
  systemOptions: { category: "sentiment" },
  userOptions: { text: "I'm happy" },
});

p.render("pt", {
  systemOptions: { categoria: "sentimentos" },
  userOptions: { texto: "Estou feliz" },
});
```

### Composable sections

```ts
import { promptSection } from "@joshuapassos/prompt-ts";

const persona = promptSection("You are a {{role}}.");
const tone = promptSection("Be professional and concise.");

const systemPrompt = [
  persona.render({ role: "translator" }),
  tone.render(),
].join("\n\n");
// => "You are a translator.\n\nBe professional and concise."
```

Sections can be composed into a `prompt`:

```ts
const p = prompt(
  "translate",
  systemPrompt,
  "Translate: {{text}}"
);

p.render({ userOptions: { text: "Hello world" } });
```

### With Zod schema

```ts
import { z } from "zod";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number(),
});

const p = prompt(
  "sentiment",
  "You are a sentiment classifier.",
  "Classify: {{text}}",
  schema
);

// Access the schema for structured output parsing
p.zodSchema; // z.ZodObject<...>
```

## API

### `prompt(name, systemTemplate, userTemplate, zodSchema?)`

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Unique identifier for logging/tracing |
| `systemTemplate` | `string \| Record<string, string>` | System message template(s) |
| `userTemplate` | `string \| Record<string, string>` | User message template(s) |
| `zodSchema` | `z.ZodType<T>` | Optional Zod schema for output validation |

#### `.render(options)` (string mode)

#### `.render(lang, options)` (multi-language mode)

Returns `{ systemPrompt: string, userPrompt: string }`.

Options are `{ systemOptions?, userOptions? }` — each is required only when the corresponding template contains `{{placeholders}}`.

### `promptSection(template)`

Creates a reusable prompt fragment. Returns `{ template, render(vars?) }`.

## Scripts

```bash
pnpm test          # Run tests
pnpm build         # Compile TypeScript
pnpm typecheck     # Type-check without emitting
```
