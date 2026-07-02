// Covers the `<style>` block support in compileSfc (registerStyles injection). The rest of the
// transformer (script/template inlining, `vue` import rewrite) is exercised by the canary build
// itself; this file only guards the CSS-parsing addition.
import { describe, expect, it } from 'vitest';

const metroVueTransformer: { compileSfc: (src: string, filename: string) => Promise<string> } =
  require('./metro-vue-transformer');
const { compileSfc } = metroVueTransformer;

function extractRegisterStylesArg(code: string): Record<string, Record<string, unknown>> {
  const match = code.match(/registerStyles\((\{[\s\S]*?\})\);/);
  if (!match?.[1]) throw new Error('no registerStyles(...) call found in compiled output');
  return JSON.parse(match[1]) as Record<string, Record<string, unknown>>;
}

const SFC_WITH_ONE_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style>
.card { padding: 10px; background-color: red; }
</style>
`;

const SFC_WITH_TWO_STYLE_BLOCKS = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style>
.card { padding: 10px; background-color: red; }
</style>
<style>
.card { background-color: blue; }
</style>
`;

const SFC_WITHOUT_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View><Text>{{ label }}</Text></View>
</template>
`;

const SFC_WITH_SCSS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="scss">
$spacing: 10px;

@mixin padded($amount) {
  padding: $amount;
}

.card {
  @include padded($spacing);

  .title {
    font-weight: bold;
  }
}
</style>
`;

const SFC_WITH_LESS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="less">
@spacing: 10px;

.padded(@amount) {
  padding: @amount;
}

.card {
  .padded(@spacing);

  .title {
    font-weight: bold;
  }
}
</style>
`;

const SFC_WITH_STYLUS_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="stylus">
spacing = 10px

padded(amount)
  padding amount

.card
  padded(spacing)

  .title
    font-weight bold
</style>
`;

const SFC_WITH_UNSUPPORTED_STYLE_LANG = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card"><Text>{{ label }}</Text></View>
</template>
<style lang="typo">
.card { padding: 10px; }
</style>
`;

const SFC_WITH_SCOPED_STYLE_BLOCK = `
<script setup lang="ts">
const isActive = true
</script>
<template>
  <View class="card">
    <View :class="{ active: isActive }" />
  </View>
</template>
<style scoped>
.card { padding: 10px; }
.active { opacity: 1; }
</style>
`;

const SFC_WITH_MIXED_GLOBAL_AND_SCOPED_BLOCKS = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card highlight" />
</template>
<style>
.highlight { color: red; }
</style>
<style scoped>
.card { padding: 10px; }
</style>
`;

const SFC_WITH_GLOBAL_ESCAPE_IN_SCOPED_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="reset" />
</template>
<style scoped>
:global(.reset) { margin: 0; }
</style>
`;

const SFC_WITH_KEBAB_CLASS_UNSCOPED = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="section-label" />
</template>
<style>
.section-label { color: red; }
</style>
`;

const SFC_WITH_KEBAB_CLASS_SCOPED = `
<script setup lang="ts">
const isActive = true
</script>
<template>
  <View class="section-label">
    <View :class="{ 'is-active': isActive }" />
  </View>
</template>
<style scoped>
.section-label { padding: 10px; }
.is-active { opacity: 1; }
</style>
`;

const SFC_WITH_MODULE_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View :class="$style.card"><Text>{{ label }}</Text></View>
</template>
<style module>
.card { padding: 10px; }
</style>
`;

const SFC_WITH_NAMED_MODULE_STYLE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View :class="classes.card"><Text>{{ label }}</Text></View>
</template>
<style module="classes">
.card { padding: 10px; }
</style>
`;

const SFC_WITH_GLOBAL_ESCAPE_IN_MODULE_BLOCK = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View :class="$style.reset" />
</template>
<style module>
:global(.reset) { margin: 0; }
</style>
`;

const SFC_WITH_SCOPED_AND_MODULE_BLOCKS_SHARING_A_CLASS_NAME = `
<script setup lang="ts">
const label = 'hi'
</script>
<template>
  <View class="card" />
  <View :class="$style.card" />
</template>
<style scoped>
.card { padding: 10px; }
</style>
<style module>
.card { padding: 20px; }
</style>
`;

function scopeIdOf(code: string): string {
  const match = code.match(/const __scopeId = "([^"]+)";/);
  if (!match?.[1]) throw new Error('no __scopeId constant found in compiled output');
  return match[1];
}

describe('metro-vue-transformer compileSfc <style> support', () => {
  it('injects registerStyles() with the parsed class map for a single <style> block', async () => {
    const code = await compileSfc(SFC_WITH_ONE_STYLE_BLOCK, 'Card.vue');
    expect(code).toContain('registerStyles(');
    expect(code).toContain("from '@symbiote/engine'");
    expect(extractRegisterStylesArg(code)).toEqual({
      card: { padding: 10, backgroundColor: 'red' },
    });
  });

  it('merges multiple <style> blocks with later blocks winning on collision', async () => {
    const code = await compileSfc(SFC_WITH_TWO_STYLE_BLOCKS, 'Card.vue');
    expect(extractRegisterStylesArg(code)).toEqual({
      card: { padding: 10, backgroundColor: 'blue' },
    });
  });

  it('injects no registerStyles() call when the SFC has no <style> block', async () => {
    const code = await compileSfc(SFC_WITHOUT_STYLE_BLOCK, 'Plain.vue');
    expect(code).not.toContain('registerStyles(');
    expect(code).not.toContain("from '@symbiote/engine'");
  });

  it('compiles a lang="scss" block — nesting, a variable, and a mixin', async () => {
    const code = await compileSfc(SFC_WITH_SCSS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterStylesArg(code)).toEqual({
      card: { padding: 10 },
      cardTitle: { fontWeight: 'bold' },
    });
  });

  it('compiles a lang="less" block — nesting, a variable, and a mixin', async () => {
    const code = await compileSfc(SFC_WITH_LESS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterStylesArg(code)).toEqual({
      card: { padding: 10 },
      cardTitle: { fontWeight: 'bold' },
    });
  });

  it('compiles a lang="stylus" block — nesting, a variable, and a function', async () => {
    const code = await compileSfc(SFC_WITH_STYLUS_STYLE_BLOCK, 'Card.vue');
    expect(extractRegisterStylesArg(code)).toEqual({
      card: { padding: 10 },
      cardTitle: { fontWeight: 'bold' },
    });
  });

  it('throws for a genuinely unsupported style lang', async () => {
    await expect(compileSfc(SFC_WITH_UNSUPPORTED_STYLE_LANG, 'Card.vue')).rejects.toThrow(
      /lang="typo" not supported yet/,
    );
  });
});

describe('metro-vue-transformer compileSfc <style scoped> support', () => {
  it('suffixes a scoped class in both registerStyles() and a static class= usage', async () => {
    const code = await compileSfc(SFC_WITH_SCOPED_STYLE_BLOCK, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(extractRegisterStylesArg(code)).toEqual({
      [`card__${scopeId}`]: { padding: 10 },
      [`active__${scopeId}`]: { opacity: 1 },
    });
    expect(code).toContain(`class: "card__${scopeId}"`);
  });

  it('wraps a dynamic :class expression with scopeClassName() instead of leaving it unresolved', async () => {
    const code = await compileSfc(SFC_WITH_SCOPED_STYLE_BLOCK, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(code).toContain("import { registerStyles, scopeClassName as __scopeClass } from '@symbiote/engine'");
    expect(code).toContain(
      `__scopeClass({ active: isActive }, __localScopedClassNames, __scopeId)`,
    );
    expect(code).toContain(`const __localScopedClassNames = new Set(["card","active"]);`);
    expect(code).toContain(`const __scopeId = "${scopeId}";`);
  });

  it('does not suffix a class from an unscoped block sharing the file with a scoped one', async () => {
    const code = await compileSfc(SFC_WITH_MIXED_GLOBAL_AND_SCOPED_BLOCKS, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(extractRegisterStylesArg(code)).toEqual({
      highlight: { color: 'red' },
      [`card__${scopeId}`]: { padding: 10 },
    });
    // static class="card highlight" — only the scoped token gets suffixed, the global one
    // that lives in the sibling unscoped block passes through unchanged in the same string.
    expect(code).toContain(`class: "card__${scopeId} highlight"`);
  });

  it('does not suffix a :global(...) selector inside a scoped block', async () => {
    const code = await compileSfc(SFC_WITH_GLOBAL_ESCAPE_IN_SCOPED_BLOCK, 'Card.vue');

    expect(extractRegisterStylesArg(code)).toEqual({
      reset: { margin: 0 },
    });
    expect(code).toContain('class: "reset"');
    expect(code).not.toMatch(/reset__data-v-/);
  });

  it('adds no scopeClassName import or nodeTransform overhead for a file with no scoped block', async () => {
    const code = await compileSfc(SFC_WITH_ONE_STYLE_BLOCK, 'Card.vue');
    expect(code).not.toContain('scopeClassName');
    expect(code).not.toContain('__localScopedClassNames');
  });
});

function moduleScopeIdOf(code: string): string {
  const match = code.match(/"card":"card__module__([^"]+)"/);
  if (!match?.[1]) throw new Error('no module-scoped card class found in compiled output');
  return match[1];
}

describe('metro-vue-transformer compileSfc <style module> support', () => {
  it('scopes every class and exposes a $style name->scopedName map', async () => {
    const code = await compileSfc(SFC_WITH_MODULE_STYLE_BLOCK, 'Card.vue');
    const scopeId = moduleScopeIdOf(code);

    expect(code).toContain(`const $style = {"card":"card__module__${scopeId}"};`);
    expect(extractRegisterStylesArg(code)).toEqual({
      [`card__module__${scopeId}`]: { padding: 10 },
    });
  });

  it('uses a custom binding name from module="classes"', async () => {
    const code = await compileSfc(SFC_WITH_NAMED_MODULE_STYLE_BLOCK, 'Card.vue');
    const scopeId = moduleScopeIdOf(code);

    expect(code).toContain(`const classes = {"card":"card__module__${scopeId}"};`);
    expect(code).not.toContain('const $style');
  });

  it('does not scope a :global(...) selector inside a module block', async () => {
    const code = await compileSfc(SFC_WITH_GLOBAL_ESCAPE_IN_MODULE_BLOCK, 'Card.vue');

    expect(code).toContain('const $style = {"reset":"reset"};');
    expect(extractRegisterStylesArg(code)).toEqual({ reset: { margin: 0 } });
  });

  it('never auto-applies a module class to a literal class= attribute (opt-in via $style.x only)', async () => {
    const code = await compileSfc(SFC_WITH_MODULE_STYLE_BLOCK, 'Card.vue');
    // Unlike <style scoped>, module classes must not be added to __localScopedClassNames — a
    // literal class="card" elsewhere in the same file must stay unsuffixed.
    expect(code).not.toContain('__localScopedClassNames');
  });

  it('does not collide with a <style scoped> block that shares the same class name', async () => {
    const code = await compileSfc(SFC_WITH_SCOPED_AND_MODULE_BLOCKS_SHARING_A_CLASS_NAME, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(extractRegisterStylesArg(code)).toEqual({
      [`card__${scopeId}`]: { padding: 10 },
      [`card__module__${scopeId}`]: { padding: 20 },
    });
  });
});

describe('metro-vue-transformer compileSfc kebab-case class= support', () => {
  it('registers a kebab-case CSS selector under its camelCase key (unscoped)', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_UNSCOPED, 'Card.vue');
    expect(extractRegisterStylesArg(code)).toEqual({ sectionLabel: { color: 'red' } });
    // the raw kebab class="section-label" attribute passes through unrewritten (no scoped
    // block installs the nodeTransform), so resolveClassName's own runtime kebab->camel
    // fallback is what makes this resolve — proven separately in style-registry.test.ts.
    expect(code).toContain('class: "section-label"');
  });

  it('normalizes a kebab-case static class= to camelCase and suffixes it when scoped', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_SCOPED, 'Card.vue');
    const scopeId = scopeIdOf(code);

    expect(extractRegisterStylesArg(code)).toEqual({
      [`sectionLabel__${scopeId}`]: { padding: 10 },
      [`isActive__${scopeId}`]: { opacity: 1 },
    });
    expect(code).toContain(`class: "sectionLabel__${scopeId}"`);
    expect(code).toContain(`const __localScopedClassNames = new Set(["sectionLabel","isActive"]);`);
  });

  it('normalizes a kebab-case key inside a dynamic :class toggle-map object literal', async () => {
    const code = await compileSfc(SFC_WITH_KEBAB_CLASS_SCOPED, 'Card.vue');
    // the toggle-map key itself stays kebab in the SOURCE expression (Vue reproduces it
    // unchanged) — normalization happens at RUNTIME inside scopeClassName, proven in
    // style-registry.test.ts's "recognizes a kebab-case toggle-map key" case. Here we only
    // confirm the compiled call site wraps the original expression unchanged.
    expect(code).toContain("__scopeClass({ 'is-active': isActive }, __localScopedClassNames, __scopeId)");
  });
});
