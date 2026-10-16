import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(
  "C:/Users/91790/Documents/Codex/2026-05-25/wanted-to-automate-my-wordpress-site",
);
await loadDotenv(path.join(rootDir, ".env"));

const config = {
  siteUrl: requiredEnv("KW_SITE_URL").replace(/\/$/, ""),
  username: requiredEnv("KW_ADMIN_USERNAME"),
  appPassword: requiredEnv("KW_ADMIN_APP_PASSWORD"),
};

const snippetCode = await fs.readFile(path.join(rootDir, "scripts/kahaniworld-site-snippet.php"), "utf8");
await upsertSnippet({
  name: "Kahani World site design, night mode, views",
  desc: "Site-wide design system, night mode toggle, footer, post views, and latest-stories shortcode.",
  code: snippetCode,
});

const pages = await wpRequest("/wp/v2/pages?slug=home&context=edit");
const home = pages[0] || await wpRequest("/wp/v2/pages/30?context=edit");
await wpRequest(`/wp/v2/pages/${home.id}`, {
  method: "POST",
  body: {
    title: "Hindi Adult Stories",
    content: buildHomeContent(),
    status: "publish",
    meta: {
      rank_math_title: "Hindi Adult Stories | Desi Kahani | Kahani World",
      rank_math_description: "Kahani World par bold Hindi adult stories, desi kahani, village kahani, real stories aur multi-part series padhein.",
      rank_math_focus_keyword: "hindi adult stories",
    },
  },
});

await ensureUtilityPage({
  title: "Advertise",
  slug: "advertise",
  content: "<h1>Advertise</h1><p>Adult network banners, sponsored placements aur direct promotion ke liye contact karein.</p>",
});
await ensureUtilityPage({
  title: "Contact",
  slug: "contact",
  content: buildContactPage(),
});
await ensureUtilityPage({
  title: "Privacy Policy",
  slug: "privacy-policy",
  content: buildPrivacyPage(),
});

console.log(JSON.stringify({ ok: true, homepage: home.id }, null, 2));

async function upsertSnippet({ name, desc, code }) {
  const snippets = await wpRequest("/code-snippets/v1/snippets");
  const existing = snippets.find((snippet) => snippet.name === name);
  const body = {
    name,
    desc,
    code,
    tags: ["kahaniworld", "design", "views"],
    scope: "front-end",
    active: true,
    priority: 10,
  };
  if (existing) {
    const updated = await wpRequest(`/code-snippets/v1/snippets/${existing.id}`, { method: "POST", body });
    if (!updated.active) {
      await wpRequest(`/code-snippets/v1/snippets/${existing.id}/activate`, { method: "POST", body: {} });
    }
    return updated;
  }
  const created = await wpRequest("/code-snippets/v1/snippets", { method: "POST", body });
  if (!created.active) {
    await wpRequest(`/code-snippets/v1/snippets/${created.id}/activate`, { method: "POST", body: {} });
  }
  return created;
}

async function ensureUtilityPage({ title, slug, content }) {
  const found = await wpRequest(`/wp/v2/pages?slug=${encodeURIComponent(slug)}&context=edit`);
  if (found[0]) {
    return wpRequest(`/wp/v2/pages/${found[0].id}`, {
      method: "POST",
      body: { title, content, status: "publish" },
    });
  }
  return wpRequest("/wp/v2/pages", {
    method: "POST",
    body: { title, slug, content, status: "publish" },
  });
}

function buildHomeContent() {
  return `
<!-- wp:html -->
<main class="kw-home">
  <section class="kw-hero">
    <h1>Hindi Adult Stories</h1>
    <p>Desi kahani, village stories, real experiences aur long Hindi adult series ka bold collection. Nayi kahaniyan, clean mobile reading aur fast navigation ke saath.</p>
  </section>

  <nav class="kw-quick" aria-label="Quick story links">
    <a class="kw-btn" href="/new-stories/">New Stories</a>
    <a class="kw-btn alt" href="/most-popular-stories/">Most Popular</a>
  </nav>

  <details class="kw-category-panel" open>
    <summary>Categories</summary>
    <h2 class="kw-section-title">Categories</h2>
    <div class="kw-chip-grid">
      
      <a class="kw-chip" href="/category/hindi-adult-stories/">Hindi Adult Stories</a>
      <a class="kw-chip" href="/category/desi-stories/">Desi Kahani</a>
      <a class="kw-chip" href="/category/village-stories/">Village Stories</a>
      <a class="kw-chip" href="/category/real-stories/">Real Stories</a>
      <a class="kw-chip" href="/category/romantic-stories/">Romantic Stories</a>
      <a class="kw-chip" href="/category/hindi-sex-story/">Hindi Sex Stories</a>
      <a class="kw-chip" href="/category/bhabhi-sex-story/">Bhabhi Sex Story</a>
    </div>
  </details>

  <h2 class="kw-section-title">Latest Stories</h2>
</main>
<!-- /wp:html -->

<!-- wp:shortcode -->
[kw_latest_stories posts_per_page="8"]
<!-- /wp:shortcode -->`.trim();
}

function buildContactPage() {
  return `
<!-- wp:html -->
<main class="kw-home">
  <section class="kw-hero">
    <h1>Contact Kahani World</h1>
    <p>Business, advertising, content request, takedown request ya general enquiry ke liye email karein.</p>
  </section>
  <article class="kw-story-card">
    <h2>Email</h2>
    <p>Contact: <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a></p>
    <p>Plain text: kahaniworld [at] protonmail.com</p>
    <p>Advertising aur partnership messages me website URL, campaign details aur contact information zaroor bhejein.</p>
  </article>
</main>
<!-- /wp:html -->`.trim();
}

function buildPrivacyPage() {
  return `
<!-- wp:html -->
<main class="kw-home">
  <section class="kw-hero">
    <h1>Privacy Policy</h1>
    <p>Kahani World visitor privacy ko seriously leta hai. Yeh page batata hai ki site par basic data kaise handle hota hai.</p>
  </section>
  <article class="kw-story-card">
    <h2>Information We Collect</h2>
    <p>Site basic analytics, browser information, cookies, page views aur security logs collect kar sakti hai. Yeh data site performance, spam protection aur user experience improve karne ke liye use hota hai.</p>
    <h2>Cookies</h2>
    <p>Cookies reading preferences, night mode, view counting aur future advertising/analytics ke liye use ho sakti hain.</p>
    <h2>Advertising</h2>
    <p>Future me third-party adult advertising networks use kiye ja sakte hain. Unki apni privacy policies aur tracking technologies ho sakti hain.</p>
    <h2>Contact</h2>
    <p>Privacy related request ke liye <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a> par email karein.</p>
    <p>Plain text: kahaniworld [at] protonmail.com</p>
  </article>
</main>
<!-- /wp:html -->`.trim();
}

async function loadDotenv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function wpRequest(endpoint, options = {}) {
  const token = Buffer.from(`${config.username}:${config.appPassword}`, "utf8").toString("base64");
  const response = await fetch(`${config.siteUrl}/wp-json${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`WordPress request failed: ${response.status} ${response.statusText} ${JSON.stringify(data)}`);
  }
  return data;
}
