#!/usr/bin/env node
/**
 * build-pages.mjs — processes the Readymag page snippets (captured from
 * emergenceprojects.com) into the clean, embeddable page files served by the
 * viewer, plus page metadata.
 *
 * Input : $RM_SOURCE_DIR (default C:/Users/prash/AppData/Local/Temp/opencode/site2)
 *         p01.html … p15.html — <article> snippets captured from the site.
 * Output: public/pages/pNN.html  (article markup only, cleaned + rewired)
 *         src/lib/pages-meta.ts (heights, content offsets, form flags, bg)
 *
 * NOTE: the raw snippets are third-party content and are NOT committed to the
 * repo (see .gitignore). Only the processed output is committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR =
  process.env.RM_SOURCE_DIR || 'C:/Users/prash/AppData/Local/Temp/opencode/site2';
const OUT_PAGES = path.join(ROOT, 'public', 'pages');
const OUT_META = path.join(ROOT, 'src', 'lib', 'pages-meta.ts');

const TOTAL_PAGES = 15;

/**
 * Maglink navigation map (locked by geometric inference — the site's public
 * data does not expose link targets; see README "Inferred navigation").
 * full data-id -> target page number
 */
const NAV_MAP = {
  // page 1 — main menu overlays
  '67811a785194934bba9e9f68': 2, // story
  '6785155a9a6afa83e520a22b': 3, // artworks
  '678130fa53c68ddec9675f0c': 4, // shop
  '6786538144005447e8942275': 5, // about
  // page 4 — shop product links
  '67ba373776493c046c21f1d3': 9, // scarf 1
  '67b712d75a7d64d4b7206bb6': 6, // sweater 1
  '67baedcf00f3dc67ac7dc6b5': 7, // sweater 2
  '67baee17d5cb10e01e560587': 8, // sweater 3
  '67baee46fbc5cf8f01b1c2f6': 12, // rug 120x120
  '67baf0643670ccde30684b4d': 13, // rug 120x150
  '67ac695edf4ad0cae52d117f': 1, // back to top
};

const PLACEHOLDER =
  'This passage is placeholder copy. Replace it with licensed content before publishing (see README). ';

const KEEP_MARKERS =
  /[@$•]|\d\s*x\s*\d|https?:\/\/|(date|materials|dimensions|price|size|paper|edition|paypal|invoice|fill out the form|sold out)/i;

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function shouldKeep(text) {
  if (text.length <= 100) return true;
  if (KEEP_MARKERS.test(text)) return true;
  return false;
}

function placeholderFor(len) {
  let out = '';
  while (out.length < len) out += PLACEHOLDER;
  return out.slice(0, Math.max(len, PLACEHOLDER.length));
}

/**
 * Line-level replacement inside text widgets. Each <p> is split on <br>;
 * short/factual lines are kept, long creative prose becomes placeholder copy
 * of roughly the same length.
 */
function replaceProse(html, pageNum, log) {
  return html.replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g, (whole, attrs, inner) => {
    if (!inner.trim()) return whole;
    if (inner.includes('<img') || inner.includes('<svg') || inner.includes('<input')) {
      return whole;
    }
    const parts = inner.split(/(<br\s*\/?>)/i);
    let changed = false;
    const out = parts.map((part) => {
      if (/^<br/i.test(part)) return part;
      const text = stripTags(part);
      if (!text) return part;
      if (shouldKeep(text)) return part;
      changed = true;
      log.push(
        `p${String(pageNum).padStart(2, '0')} replace: ${text.slice(0, 64)}… (${text.length} chars)`
      );
      return placeholderFor(text.length);
    });
    return changed ? `<p${attrs || ''}>${out.join('')}</p>` : whole;
  });
}

function extractArticle(html) {
  const start = html.indexOf('<article');
  if (start === -1) return null;
  const end = html.indexOf('</article>', start);
  if (end === -1) return null;
  return html.slice(start, end + '</article>'.length);
}

function clean(article) {
  let out = article;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<div id="page-\d+-password-container"[^>]*>\s*<\/div>/g, '');
  return out;
}

function rewriteLinks(article) {
  let out = article;

  // maglink anchors (menu overlays + product links + back-to-top)
  out = out.replace(
    /<a class="maglink([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g,
    (whole, extraCls, attrs, inner) => {
      const idm = inner.match(/data-id="([0-9a-f]+)"/);
      if (!idm) return whole;
      const target = NAV_MAP[idm[1]];
      if (!target) return whole;
      if (/data-nav=/.test(attrs)) return whole;
      return `<a class="maglink${extraCls}"${attrs} data-nav="${target}">${inner}</a>`;
    }
  );

  // goback arrows -> browser history back (fallback to shop)
  out = out.replace(
    /<a class="goback-link"([^>]*)>/g,
    (whole, attrs) => (attrs.includes('data-goback') ? whole : `<a class="goback-link"${attrs} data-goback="1">`)
  );

  return out;
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    console.error('Set RM_SOURCE_DIR to the folder containing p01.html…p15.html');
    process.exit(1);
  }
  fs.mkdirSync(OUT_PAGES, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_META), { recursive: true });

  const metas = [];
  const log = [];

  for (let n = 1; n <= TOTAL_PAGES; n++) {
    const name = `p${String(n).padStart(2, '0')}`;
    const srcFile = path.join(SOURCE_DIR, `${name}.html`);
    if (!fs.existsSync(srcFile)) {
      console.error(`Missing ${srcFile}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(srcFile, 'utf8');
    let article = extractArticle(raw);
    if (!article) {
      console.error(`No <article> in ${name}.html`);
      process.exit(1);
    }

    article = clean(article);
    article = rewriteLinks(article);
    const before = log.length;
    article = replaceProse(article, n, log);

    const heightM = article.match(/<article[^>]*style="[^"]*height:\s*([\d.]+)px/);
    const topM = article.match(/page-content-container" style="[^"]*top:\s*(-?[\d.]+)px/);
    const bgM = article.match(/widget-background" style="background-color:\s*(#[0-9a-fA-F]{3,8})/);
    const hasForm = /<form[\s>]/.test(article);

    const meta = {
      n,
      height: heightM ? Math.round(parseFloat(heightM[1])) : 672,
      contentTop: topM ? Math.round(parseFloat(topM[1]) * 100) / 100 : 0,
      hasForm,
      bg: bgM ? bgM[1] : '#e4e4e4',
      replacements: log.length - before,
    };
    metas.push(meta);

    fs.writeFileSync(path.join(OUT_PAGES, `${name}.html`), article, 'utf8');
    console.log(
      `p${String(n).padStart(2, '0')}: h=${meta.height} top=${meta.contentTop} form=${hasForm} replaced=${meta.replacements} (${Math.round(article.length / 1024)}kb)`
    );
  }

  const metaTs = `// AUTO-GENERATED by tools/build-pages.mjs — do not edit by hand.
export type PageMeta = {
  n: number;
  height: number;
  contentTop: number;
  hasForm: boolean;
  bg: string;
  replacements: number;
};

export const TOTAL_PAGES = ${TOTAL_PAGES};

export const PAGES_META: PageMeta[] = ${JSON.stringify(metas, null, 2)};
`;
  fs.writeFileSync(OUT_META, metaTs, 'utf8');

  fs.writeFileSync(
    path.join(OUT_PAGES, 'replacements.log'),
    log.join('\n') + '\n',
    'utf8'
  );

  console.log(`\nWrote ${metas.length} pages to public/pages/ and ${path.relative(ROOT, OUT_META)}`);
  console.log(`Total text replacements: ${log.length} (see public/pages/replacements.log)`);
}

main();
