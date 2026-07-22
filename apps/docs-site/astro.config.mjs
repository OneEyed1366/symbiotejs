import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const base = '/';

export default defineConfig({
  site: 'https://docs.symbiote-native.dev',
  base,
  integrations: [
    starlight({
      title: 'SymbioteNative',
      description: 'Framework-agnostic React Native renderer for real native iOS and Android apps.',
      favicon: '/symbiote.svg',
      logo: {
        src: './src/assets/symbiote-logo.svg',
      },
      customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
      head: [
        {
          // Yandex.Webmaster site verification. The `docs` subdomain is a CNAME to
          // GitHub Pages, so a `yandex-verification` DNS TXT record can't coexist with
          // the CNAME — the meta-tag method is used instead. (Google verifies via a
          // TXT record on the apex, where there is no CNAME.)
          tag: 'meta',
          attrs: { name: 'yandex-verification', content: '2c452926a06c3852' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap',
          },
        },
        {
          // Restores the bonded framework before paint, AND aligns Starlight's own
          // <Tabs syncKey="framework"> restore mechanism to the same preference:
          // Starlight persists the synced tab under `starlight-synced-tabs__framework`
          // keyed by the tab's LABEL TEXT ("React"/"Vue"/"Angular"), read by its own
          // inline restore script the instant each <starlight-tabs> connects — before
          // this page's body finishes parsing. Writing it here, synchronously in
          // <head>, keeps the two preferences (this site's `symbiote` id and
          // Starlight's own label-keyed store) always in lockstep on load.
          tag: 'script',
          content: `
            try {
              var s = localStorage.getItem('symbiote');
              var id = s === 'vue' || s === 'angular' ? s : 'react';
              document.documentElement.dataset.symbiote = id;
              var LABEL = { react: 'React', vue: 'Vue', angular: 'Angular' };
              localStorage.setItem('starlight-synced-tabs__framework', LABEL[id]);
            } catch (e) {}
          `,
        },
        {
          // The favicon (public/symbiote.svg) is a static file, so it always renders
          // React's default cyan — mismatched against the bonded accent the head script
          // above already applies to text/borders. Same brand-mark shape, recolored to
          // match, once the nav DOM exists (unlike the script above, this can't run
          // pre-paint — the tab icon has no CSS-var equivalent to starlight.css's
          // .site-title::before, which is why the sidebar logo uses that instead).
          //
          // Docs pages carry no chip switcher of their own — the only way the
          // preference changes there is clicking a synced <Tabs syncKey="framework">
          // tab (see docs/packages/*.mdx). The click listener below mirrors that
          // choice back into the site-wide `symbiote` key + `data-symbiote` attribute
          // (which the CSS brand-color variables already react to) and re-runs the
          // same favicon recolor, so leaving to another page — or back to the
          // landing page — keeps the same bonded framework everywhere.
          tag: 'script',
          content: `
            (function () {
              var GRADIENTS = {
                react: ['#61dafb', '#2bb0d6'],
                vue: ['#42d392', '#35a479'],
                angular: ['#e40035', '#f6007b', '#9c0aab'],
              };
              var ID_BY_LABEL = { React: 'react', Vue: 'vue', Angular: 'angular' };

              function recolorFavicon() {
                try {
                  var id = document.documentElement.dataset.symbiote || 'react';
                  var stops = GRADIENTS[id] || GRADIENTS.react;
                  var stopTags = stops
                    .map(function (c, i) {
                      return '<stop offset="' + i / (stops.length - 1) + '" stop-color="' + c + '"/>';
                    })
                    .join('');
                  var svg =
                    '<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<rect width="128" height="128" rx="30" fill="#030406"/>' +
                    '<circle cx="64" cy="64" r="46" fill="' + stops[0] + '" opacity="0.35" filter="url(#glow)"/>' +
                    '<path d="M45,20 L68,20 A40 40 0 0 1 108,60 L108,77 A31 31 0 0 1 77,108 L60,108 A40 40 0 0 1 20,68 L20,45 A25 25 0 0 1 45,20 Z" fill="url(#g)"/>' +
                    '<ellipse cx="48" cy="42" rx="14" ry="9" fill="#ffffff" opacity="0.28" filter="url(#sheen)"/>' +
                    '<defs><linearGradient id="g" x1="20" y1="20" x2="108" y2="108" gradientUnits="userSpaceOnUse">' +
                    stopTags +
                    '</linearGradient>' +
                    '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>' +
                    '<filter id="sheen" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>' +
                    '</defs></svg>';
                  var href = 'data:image/svg+xml,' + encodeURIComponent(svg);
                  var icon = document.querySelector('link[rel~="icon"]');
                  if (icon) icon.href = href;
                } catch (e) {}
              }

              document.addEventListener('DOMContentLoaded', recolorFavicon);

              document.addEventListener('click', function (e) {
                var tab =
                  e.target.closest &&
                  e.target.closest('starlight-tabs[data-sync-key="framework"] [role="tab"]');
                if (!tab) return;
                var id = ID_BY_LABEL[tab.textContent.trim()];
                if (!id) return;
                try {
                  localStorage.setItem('symbiote', id);
                } catch (err) {}
                document.documentElement.dataset.symbiote = id;
                recolorFavicon();
              });
            })();
          `,
        },
      ],
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        // Keep the site i18n-ready. Add `ru` content only when the
        // English docs stabilize and real translations exist.
        // ru: { label: 'Русский', lang: 'ru' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/OneEyed1366/symbiote-native',
        },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is SymbioteNative?', slug: 'docs' },
            { label: 'Quick start', slug: 'docs/quick-start' },
            { label: 'How it works', slug: 'docs/how-it-works' },
          ],
        },
        {
          label: 'Learn',
          items: [
            { label: 'React guide', slug: 'docs/learn/react' },
            { label: 'Vue guide', slug: 'docs/learn/vue' },
            { label: 'Angular guide', slug: 'docs/learn/angular' },
            { label: 'Styling', slug: 'docs/learn/styling' },
            { label: 'Animations', slug: 'docs/learn/animations' },
            { label: 'Events', slug: 'docs/learn/events' },
          ],
        },
        {
          label: 'How-tos',
          items: [
            { label: 'Overview', slug: 'docs/howtos' },
            { label: 'Style a component', slug: 'docs/howtos/styling' },
            { label: 'Animate a value', slug: 'docs/howtos/animations' },
            { label: 'Handle press/change events', slug: 'docs/howtos/events' },
            { label: 'Two-way bind a value', slug: 'docs/howtos/two-way-binding' },
            { label: 'Share content across surfaces', slug: 'docs/howtos/portals-and-tunnels' },
            { label: 'Write platform-specific code', slug: 'docs/howtos/platform-code' },
            { label: 'Wrap a third-party native view', slug: 'docs/howtos/third-party-views' },
            { label: 'Add a native splash screen', slug: 'docs/howtos/splash-screen' },
            { label: 'Turn on diagnostic logging', slug: 'docs/howtos/debugging' },
          ],
        },
        {
          label: 'Navigation',
          items: [
            { label: 'Overview', slug: 'docs/navigation' },
            { label: 'Stack navigator', slug: 'docs/navigation/stack' },
            { label: 'Tab navigator', slug: 'docs/navigation/tabs' },
            { label: 'Drawer navigator', slug: 'docs/navigation/drawer' },
            { label: 'Hooks & focus', slug: 'docs/navigation/hooks' },
            { label: 'Linking & state', slug: 'docs/navigation/linking' },
            { label: 'FAQ', slug: 'docs/navigation/faq' },
          ],
        },
        {
          label: 'Testing',
          items: [{ label: 'Vitest + Detox', slug: 'docs/testing' }],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Overview', slug: 'docs/examples' },
            { label: 'Counter', slug: 'docs/examples/counter' },
            { label: 'Pressable', slug: 'docs/examples/pressable' },
            { label: 'TextInput', slug: 'docs/examples/text-input' },
          ],
        },
        {
          label: 'API',
          items: [
            { label: 'Overview', slug: 'docs/api' },
            { label: 'React', slug: 'docs/api/react' },
            { label: 'Vue', slug: 'docs/api/vue' },
            { label: 'Angular', slug: 'docs/api/angular' },
            { label: 'Components', slug: 'docs/api/components' },
            { label: 'Core', slug: 'docs/api/core' },
          ],
        },
        {
          label: 'Packages',
          items: [
            { label: 'Slider', slug: 'docs/packages/slider' },
            { label: 'Splash screen', slug: 'docs/packages/splash-screen' },
          ],
        },
        {
          label: 'Project',
          items: [
            { label: 'Status', slug: 'docs/project/status' },
            { label: 'Roadmap', slug: 'docs/project/roadmap' },
            { label: 'FAQ', slug: 'docs/project/faq' },
          ],
        },
      ],
    }),
  ],
});
