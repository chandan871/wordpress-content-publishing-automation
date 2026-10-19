import fs from "node:fs/promises";
import path from "node:path";

const applyChanges = process.argv.includes("--apply");
if (!applyChanges) {
  console.log(JSON.stringify({
    dryRun: true,
    message: "No WordPress changes were made. Review the files, then run with --apply to deploy.",
    planned: ["homepage", "about", "contact", "advertise", "privacy-policy", "cookies-policy", "terms-of-use", "site snippet"],
  }, null, 2));
  process.exit(0);
}

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
  desc: "Site-wide design system, night mode toggle, footer, private view tracking, and latest-stories shortcode.",
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
  content: buildAdvertisePage(),
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
await ensureUtilityPage({
  title: "About Kahani World",
  slug: "about",
  content: buildAboutPage(),
});
await ensureUtilityPage({
  title: "Cookies Policy",
  slug: "cookies-policy",
  content: buildCookiesPage(),
});
await ensureUtilityPage({
  title: "Terms of Use",
  slug: "terms-of-use",
  content: buildTermsPage(),
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
    <h1>Hindi Adult Stories, Hindi Sex Stories aur Desi Sex Stories</h1>
    <p>Kahani World par roz nayi Hindi adult stories aur Hindi sex story (हिंदी सेक्स स्टोरी) padhein: akeli bhabhi, padosan aunty, <a href="/category/village-stories/">village sex stories</a>, <a href="/category/real-stories/">real sex stories</a> aur <a href="/category/romantic-stories/">romantic sex stories</a>. Har din ek nayi hot chudai ki kahani, aur aisi multi-part series jinka agla part aap miss nahi karna chahenge. Kahani World ki sabhi kahaniyon ke paatr adult hain. Sirf 18+ readers ke liye.</p>
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
      <a class="kw-chip" href="/category/hindi-sex-story/">Hindi Sex Story</a>
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
<main class="kw-home kw-legal">
  <section class="kw-hero"><h1>Privacy Policy</h1><p>Last updated: 16 October 2026. This policy explains how Kahani World may handle information when you visit this website.</p></section>
  <article class="kw-story-card">
    <h2>1. About this policy</h2><p>Kahani World publishes stories and related editorial content on this website. We do not accept reader story submissions or operate reader accounts through this site. This policy applies to information processed through the website, its hosting, and any tools or services enabled on it.</p>
    <h2>2. Information that may be processed</h2><p>When you visit, the website or its service providers may process technical information such as IP address, browser and device type, requested pages, referring page, timestamps, and security or error logs. If analytics are enabled, usage information may also be collected to understand site performance. We do not ask you to provide sensitive personal information to read stories.</p>
    <h2>3. Cookies and local storage</h2><p>The website may use essential WordPress or hosting technologies, a short-lived cookie to help avoid repeatedly counting a story view on the same browser, and browser local storage to remember your night-mode preference. If analytics or advertising services are enabled, those providers may use their own cookies or similar technologies. See our <a href="/cookies-policy/">Cookies Policy</a>.</p>
    <h2>4. Why information is used</h2><p>Technical information may be used to deliver pages, maintain security, troubleshoot errors, measure readership where analytics are enabled, remember display preferences, and protect the site from abuse. We do not sell personal information to data brokers.</p>
    <h2>5. Third-party services and links</h2><p>Hosting, analytics, security, and advertising providers may process information under their own terms and privacy policies when their services are active. Stories or pages may link to external websites; we do not control their privacy practices. Please review the relevant provider's policy before using an external service.</p>
    <h2>6. Retention and security</h2><p>Technical logs and analytics data are retained according to the settings and practices of the relevant hosting or service provider. We use reasonable measures intended to protect the website, but no internet transmission or storage system can be guaranteed to be completely secure.</p>
    <h2>7. Your choices and requests</h2><p>You can clear cookies and local storage through your browser settings; doing so may reset preferences or affect some site functions. Depending on your location and applicable law, you may have rights to request access, correction, deletion, or other handling of personal information. We may need to verify a request before acting on it.</p>
    <h2>8. Adults only</h2><p>Kahani World is intended for adults aged 18 or older. If you are under 18, do not use this website. If you believe a minor's personal information has been submitted to us, contact us so we can review the matter.</p>
    <h2>9. Changes and contact</h2><p>This policy may be updated when the site or its services change. The latest revision date appears above. For privacy questions, contact <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a>.</p>
  </article>
</main>
<!-- /wp:html -->`.trim();
}

function buildCookiesPage() {
  return `
<!-- wp:html -->
<main class="kw-home kw-legal">
  <section class="kw-hero"><h1>Cookies Policy</h1><p>Last updated: 16 October 2026. How cookies and similar browser storage may be used on Kahani World.</p></section>
  <article class="kw-story-card">
    <h2>What are cookies?</h2><p>Cookies are small text files stored by your browser. Websites may also use browser local storage or similar technologies to remember preferences and support site functions.</p>
    <h2>How this site may use them</h2><ul><li><strong>Site operation:</strong> WordPress and hosting may use cookies needed for technical functions or security.</li><li><strong>Story-view counting:</strong> a cookie named for a story may help avoid counting repeat visits from the same browser within a limited period.</li><li><strong>Night mode:</strong> local storage may remember whether you selected the dark theme. This preference is stored in your browser rather than being required for reading.</li><li><strong>Analytics or advertising:</strong> if these services are enabled, their providers may set cookies or use similar technologies under their own policies.</li></ul>
    <h2>Your controls</h2><p>You can block or delete cookies in your browser settings. Blocking them may affect preferences, measurements, or some website functions. Clearing local storage may reset night mode. Browser controls do not necessarily stop every form of analytics or advertising measurement.</p>
    <h2>Third-party services</h2><p>When third-party analytics or advertising tools are active, those providers determine their own technologies and practices. Review their policies for details. We will update this page if the site's use of cookies materially changes.</p>
    <h2>Contact</h2><p>Questions about this policy? Email <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a>.</p>
  </article>
</main>
<!-- /wp:html -->`.trim();
}

function buildTermsPage() {
  return `
<!-- wp:html -->
<main class="kw-home kw-legal">
  <section class="kw-hero"><h1>Terms of Use</h1><p>Last updated: 16 October 2026. By accessing Kahani World, you agree to use the website in accordance with these terms.</p></section>
  <article class="kw-story-card">
    <h2>1. Adults only</h2><p>This website contains adult-oriented fictional or narrative material and is intended strictly for people aged 18 or older, or the age of majority in their location if higher. Do not access the site if you are underage or if accessing this material is unlawful where you live.</p>
    <h2>2. Website content</h2><p>Kahani World publishes stories and related content for reading and general entertainment. Content may be fictional, dramatized, or presented as a story; unless expressly stated otherwise, it should not be treated as verified reporting or professional advice. Titles and categories are intended to describe the content, but individual reader interpretations may differ.</p>
    <h2>3. Intellectual property</h2><p>Unless otherwise indicated, website design, branding, and original material published by Kahani World are protected by applicable intellectual-property laws. You may access and read content for personal, non-commercial use. You may not republish, sell, systematically copy, or distribute site content without permission, except where permitted by law.</p>
    <h2>4. Acceptable use</h2><p>You must not attempt to disrupt the website, bypass security, scrape or harvest data at scale, introduce malicious code, impersonate another person, or use the site in violation of applicable law. Do not use the website to infringe another person's rights.</p>
    <h2>5. Third-party links and advertising</h2><p>The website may link to third-party websites or display third-party advertising if enabled. Those services are operated independently and may have separate terms and privacy policies. Kahani World is not responsible for third-party sites or services it does not control.</p>
    <h2>6. Reporting content or copyright concerns</h2><p>If you believe material on this site infringes your copyright, violates your rights, or raises a serious safety or legal concern, email <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a>. Include the exact page URL, a description of the concern, your relationship to the material, and relevant supporting details. For copyright requests, include your contact details and enough information for us to assess the claim. We may ask for clarification before taking action.</p>
    <h2>7. Availability and disclaimers</h2><p>We aim to keep the website available and content accessible, but do not guarantee uninterrupted service, error-free pages, or that every item will remain available. To the extent permitted by law, the site is provided on an “as available” basis and without warranties not expressly required by law.</p>
    <h2>8. Changes</h2><p>We may update these terms as the website changes. The revised date appears above. Continued use after an update means you accept the revised terms to the extent permitted by applicable law.</p>
    <h2>9. Contact</h2><p>Questions or notices: <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a>.</p>
  </article>
</main>
<!-- /wp:html -->`.trim();
}

function buildAboutPage() {
  return `
<!-- wp:html -->
<main class="kw-home kw-legal">
  <section class="kw-hero"><h1>About Kahani World</h1><p>Kahani World is a Hindi story-reading website focused on desi kahani, village stories, romantic stories, real-story-style narratives, and adult-oriented Hindi fiction.</p></section>
  <article class="kw-story-card">
    <h2>What you'll find here</h2><p>Our site organizes Hindi stories into categories so readers can explore themes and find stories more easily. You can browse the latest stories, explore categories, or visit the most-popular section where available.</p>
    <h2>Our publishing approach</h2><p>Kahani World publishes stories on the site itself. We do not accept reader story submissions or provide reader author accounts through this website. Story descriptions and labels are provided to help readers navigate the collection; fictional or dramatized narratives should not automatically be taken as independently verified facts.</p>
    <h2>For adults</h2><p>Some content is intended for adults only. Visitors must be at least 18 years old, or meet the higher age of majority where applicable. If you are underage, please leave the site.</p>
    <h2>Contact and concerns</h2><p>For general questions, advertising enquiries, or a content/copyright concern, visit our <a href="/contact/">Contact page</a> or email <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a>.</p>
  </article>
</main>
<!-- /wp:html -->`.trim();
}

function buildAdvertisePage() {
  return `
<!-- wp:html -->
<main class="kw-home kw-legal">
  <section class="kw-hero"><h1>Advertise on Kahani World</h1><p>For relevant advertising and partnership enquiries, contact us with clear details about your campaign.</p></section>
  <article class="kw-story-card">
    <h2>Advertising enquiries</h2><p>We may consider suitable banner placements, clearly identified sponsored promotions, and direct advertising proposals. Availability, placement, format, pricing, and approval are discussed individually; contacting us does not guarantee acceptance or publication.</p>
    <h2>What to include</h2><ul><li>Your business or brand name and website URL</li><li>The product or service being promoted</li><li>Preferred placement, campaign dates, and budget range</li><li>Your contact details and any creative or destination URLs</li></ul>
    <h2>Content and safety standards</h2><p>We may decline advertising that is deceptive, unlawful, malicious, misleading, or unsuitable for the site. Advertisements must not use forced redirects, malware, fake system alerts, or deceptive download prompts. Sponsored placements, where accepted, should be identifiable as advertising. Third-party advertising providers may have additional rules and privacy practices.</p>
    <h2>Contact</h2><p>Email <a href="mailto:kahaniworld@protonmail.com">kahaniworld@protonmail.com</a> with the subject “Advertising Enquiry”. Please do not send passwords, payment-card details, or other sensitive information by email.</p>
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
