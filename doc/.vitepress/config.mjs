import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const docDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Pages that are symlinks to other pages, excluded from the search index to
// avoid duplicate results.
const symlinkedPages = [
  'guide/index.md',
  'recipes/index.md',
  'api/model/index.md',
];

// The slugify function used by VuePress 1, so that existing header anchors
// keep working.
const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+/g;
const rCombining = /[̀-ͯ]/g;

function slugify(str) {
  return str
    .normalize('NFKD')
    .replace(rCombining, '')
    .replace(rControl, '')
    .replace(rSpecial, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One sidebar item per h2 of the page at `link`, like VuePress' sidebar showed
// the headers of the current page. Used instead of VitePress' outline.
function headingItems(link) {
  const file = path.join(
    docDir,
    link.endsWith('/') ? `${link}index.md` : `${link}.md`,
  );
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => {
      const title = line.slice(3).trim();
      return {
        text: escapeHtml(title).replace(/`([^`]*)`/g, '<code>$1</code>'),
        link: `${link}#${slugify(title.replace(/`/g, ''))}`,
      };
    });
}

// Emulates VuePress' `sidebar: auto` for single-page sections.
function autoSidebar(text, link) {
  return [{ text, link, items: headingItems(link) }];
}

// Pages with their headings, collapsed except for the current page.
function sidebarGroup(text, base, children) {
  return [
    {
      text,
      items: children.map(([link, text]) => {
        const items = headingItems(`${base}${link}`);
        return items.length > 0
          ? { text, link: `${base}${link}`, items, collapsed: true }
          : { text, link: `${base}${link}` };
      }),
    },
  ];
}

export default defineConfig({
  title: 'Objection.js',
  description: 'An SQL friendly ORM for node.js',
  base: '/objection/',
  appearance: 'dark',

  markdown: {
    anchor: { slugify },
  },

  // No outline aside: the headings of the current page are in the sidebar.
  transformPageData(pageData) {
    pageData.frontmatter.aside ??= false;
  },

  vite: {
    // The local search index is a single chunk of ~500 kB.
    build: { chunkSizeWarningLimit: 1000 },
  },

  themeConfig: {
    // The headings of the current page are listed in the sidebar instead.
    outline: false,

    search: {
      provider: 'local',
      options: {
        _render(src, env, md) {
          return symlinkedPages.includes(env.relativePath)
            ? ''
            : md.render(src, env);
        },
      },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ditojs/objection' },
    ],

    editLink: {
      pattern: 'https://github.com/ditojs/objection/edit/main/doc/:path',
    },

    footer: {
      message: 'MIT Licensed',
      copyright: 'Copyright © 2015-present Sami Koskimäki',
    },

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
      {
        text: 'API Reference',
        activeMatch: '^/api/',
        items: [
          { text: 'Main Module', link: '/api/objection/' },
          { text: 'Query Builder', link: '/api/query-builder/' },
          { text: 'Model', link: '/api/model/' },
          { text: 'Types', link: '/api/types/' },
        ],
      },
      { text: 'Recipe Book', link: '/recipes/', activeMatch: '^/recipes/' },
      {
        text: 'Release Notes',
        activeMatch: '^/release-notes/',
        items: [
          { text: 'Changelog', link: '/release-notes/changelog' },
          { text: 'Migration to 3.0', link: '/release-notes/migration' },
          {
            text: 'v2.x documentation',
            link: 'https://github.com/Vincit/objection.js/tree/v2/doc',
          },
          {
            text: 'v1.x documentation',
            link: 'https://github.com/Vincit/objection.js/tree/v1/doc',
          },
        ],
      },
      { text: '⭐ Star', link: 'https://github.com/ditojs/objection' },
    ],

    sidebar: {
      '/guide/': sidebarGroup('Guide', '/guide/', [
        ['installation', 'Installation'],
        ['getting-started', 'Getting started'],
        ['models', 'Models'],
        ['relations', 'Relations'],
        ['query-examples', 'Query examples'],
        ['transactions', 'Transactions'],
        ['hooks', 'Hooks'],
        ['validation', 'Validation'],
        ['documents', 'Documents'],
        ['plugins', 'Plugins'],
        ['contributing', 'Contribution guide'],
      ]),

      '/api/model/': sidebarGroup('Model API Reference', '/api/model/', [
        ['overview', 'Overview'],
        ['static-properties', 'Static Properties'],
        ['static-methods', 'Static Methods'],
        ['instance-methods', 'Instance Methods'],
        ['instance-properties', 'Instance Properties'],
      ]),

      '/api/objection/': autoSidebar(
        'Objection API Reference',
        '/api/objection/',
      ),

      '/api/types/': autoSidebar('Types', '/api/types/'),

      '/api/query-builder/': sidebarGroup(
        'Query Builder API Reference',
        '/api/query-builder/',
        [
          ['find-methods', 'Find Methods'],
          ['mutate-methods', 'Mutating Methods'],
          ['eager-methods', 'Eager Loading Methods'],
          ['join-methods', 'Join Methods'],
          ['other-methods', 'Other Methods'],
          ['static-methods', 'Static Methods'],
        ],
      ),

      '/recipes/': sidebarGroup('Recipes', '/recipes/', [
        ['raw-queries', 'Raw queries'],
        ['precedence-and-parentheses', 'Precedence and parentheses'],
        ['subqueries', 'Subqueries'],
        ['relation-subqueries', 'Relation subqueries'],
        ['joins', 'Joins'],
        ['modifiers', 'Modifiers'],
        ['composite-keys', 'Composite keys'],
        ['polymorphic-associations', 'Polymorphic associations'],
        ['json-queries', 'JSON queries'],
        ['custom-id-column', 'Custom id column'],
        ['extra-properties', 'Join table extra properties'],
        ['custom-validation', 'Custom validation'],
        [
          'snake-case-to-camel-case-conversion',
          'Snake case to camel case conversion',
        ],
        ['paging', 'Paging'],
        ['returning-tricks', 'PostgreSQL "returning" tricks'],
        ['timestamps', 'Timestamps'],
        [
          'custom-query-builder',
          'Custom query builder (extending the query builder)',
        ],
        [
          'multitenancy-using-multiple-databases',
          'Multitenancy using multiple databases',
        ],
        ['default-values', 'Default values'],
        ['error-handling', 'Error handling'],
        ['ternary-relationships', 'Ternary relationships'],
        [
          'indexing-postgresql-jsonb-columns',
          'Indexing PostgreSQL JSONB columns',
        ],
      ]),
    },
  },
});
