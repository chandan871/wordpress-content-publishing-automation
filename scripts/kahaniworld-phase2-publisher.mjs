import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const OUT_DIR = path.join(ROOT_DIR, "outputs");
const EXPECTED_HEADERS = [
  "ID",
  "Title",
  "Story",
  "Status",
  "Category",
  "Tags",
  "SEO Title",
  "Meta Description",
  "Slug",
  "WordPress URL",
  "Error Log",
];
const KNOWN_HEADERS = [
  ...EXPECTED_HEADERS,
  "WordPress Post ID",
  "Published Date",
  "Last Updated",
];
const SLUG_STOPWORDS = new Set(["ki", "ka", "ke", "aur", "ek", "mein", "me", "se", "par", "the", "a", "an"]);

await loadDotenv(path.join(ROOT_DIR, ".env"));
await fs.mkdir(OUT_DIR, { recursive: true });

const args = parseArgs(process.argv.slice(2));
//const mode = args.publish ? "publish" : "dry-run";
const mode = args.update ? "update" : args.publish ? "publish" : "dry-run";
const limit = Number(args.limit || 1);
const rowId = args["row-id"] || "";

const config = {
  siteUrl: requiredEnv("KW_SITE_URL").replace(/\/$/, ""),
  wpUsername: requiredEnv("KW_WP_USERNAME"),
  wpAppPassword: requiredEnv("KW_WP_APP_PASSWORD"),
  sheetId: requiredEnv("KW_GOOGLE_SHEET_ID"),
  sheetName: process.env.KW_GOOGLE_SHEET_NAME || "Content Queue",
  sheetWebhookUrl: process.env.KW_SHEET_WEBHOOK_URL || "",
  sheetWebhookSecret: process.env.KW_SHEET_WEBHOOK_SECRET || "",
};

log("config", `Mode: ${mode}`);
log("config", `Sheet: ${config.sheetName}`);

if (args["check-wp"]) {
  const me = await wpRequest("/wp/v2/users/me?context=edit");
  console.log(JSON.stringify({ ok: true, username: me.username, roles: me.roles }, null, 2));
  process.exit(0);
}

let sheet;
try {
  sheet = await readSheet();
} catch (error) {
  if (args["check-sheet"] && error.parsedHeaders) {
    console.log(JSON.stringify({
      ok: false,
      error: error.message,
      parsedHeaders: error.parsedHeaders,
      normalizedHeaders: error.normalizedHeaders,
      expectedHeaders: EXPECTED_HEADERS,
      headerDiagnostics: error.headerDiagnostics,
    }, null, 2));
    process.exit(1);
  }
  throw error;
}

const eligibleRows = sheet.rows
  .filter((row) => !rowId || cell(row, "ID") === rowId)
  .filter((row) => rowId || isEligibleRow(row))
  .slice(0, limit);


if (args["check-sheet"]) {
  console.log(JSON.stringify({
    ok: true,
    headers: sheet.headers,
    rawHeaders: sheet.rawHeaders,
    headerRepairs: sheet.headerRepairs,
    readyRows: sheet.rows.filter((row) => cell(row, "Status") === "Ready").length,
    updateRows: sheet.rows.filter((row) => cell(row, "Status") === "Published" && getWordPressPostId(row)).length,
    totalRows: sheet.rows.length,
  }, null, 2));
  process.exit(0);
}

const results = [];
for (const row of eligibleRows) {
  const id = cell(row, "ID") || "(missing ID)";
  try {
    log("row", `Processing ${id}`);
    const context = await buildContext(row);

    if (mode === "update") {
      const validation = validateUpdateRow(row);
      if (!validation.ok) {
        results.push(failedResult(row, validation.errors.join("; ")));
        continue;
      }

      const prepared = await prepareRow(row, context);
      const updatePlan = await buildUpdatePlan(row, prepared);
      if (!args.apply) {
        results.push(updatePlan);
        continue;
      }

      const updated = await withRetries(() => updateExistingPost(updatePlan), 2);
      if (Number(updated.id) !== Number(updatePlan.wordpressPostId)) {
        throw new Error(`Update safety assertion failed: requested post ${updatePlan.wordpressPostId}, got ${updated.id}`);
      }

      const verification = await verifyPublishedPage(updatePlan.wordpressUrl || updated.link, {
        ...prepared,
        slug: updatePlan.existingSlug,
      });
      results.push({
        ...updatePlan,
        ok: verification.ok,
        applied: true,
        verification,
        errorLog: verification.ok ? "" : verification.errors.join("; "),
      });
      continue;
    }

    const validation = validateRow(row, context);

    if (!validation.ok) {
      const result = failedResult(row, validation.errors.join("; "));
      results.push(result);
      if (mode === "publish") await updateSheetRow(result);
      continue;
    }

    

    const prepared = await prepareRow(row, context);
    const duplicate = await checkDuplicates(prepared, context);
    if (!duplicate.ok) {
      const result = failedResult(row, duplicate.errors.join("; "));
      results.push(result);
      if (mode === "publish") await updateSheetRow(result);
      continue;
    }

    if (mode === "dry-run") {
      results.push({ mode, ok: true, ...prepared });
      continue;
    }

    await updateSheetRow({
      id: prepared.id,
      status: "Publishing",
      errorLog: "",
    });

    const published = await withRetries(() => publishPost(prepared), 2);
    const verification = await verifyPublishedPage(published.link, prepared);
    if (!verification.ok) {
      const result = failedResult(row, `Published but verification failed: ${verification.errors.join("; ")}`);
      result.wordpressUrl = published.link;
      result.wordpressPostId = published.id;
      results.push(result);
      await updateSheetRow(result);
      continue;
    }

    const result = {
      mode,
      ok: true,
      id: prepared.id,
      status: "Published",
      wordpressPostId: published.id,
      wordpressUrl: published.link,
      seoTitle: prepared.seoTitle,
      metaDescription: prepared.metaDescription,
      slug: prepared.slug,
      errorLog: "",
      verification,
    };
    results.push(result);
    await updateSheetRow(result);
  } catch (error) {
    const result = failedResult(row, error.message);
    results.push(result);
    if (mode === "publish") await updateSheetRow(result);
  }
}

function isEligibleRow(row) {
  if (mode === "update") {
    return cell(row, "Status") === "Published" && Boolean(getWordPressPostId(row));
  }
  return cell(row, "Status") === "Ready";
}

const report = {
  ok: results.every((result) => result.ok),
  mode,
  generatedAt: new Date().toISOString(),
  processedRows: results.length,
  results,
};

const reportPath = path.join(OUT_DIR, `phase2-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(reportPath, JSON.stringify(redactReport(report), null, 2), "utf8");
log("report", reportPath);
console.log(JSON.stringify(redactReport(report), null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      parsed[key] = argv[i + 1];
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
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
  if (!value || value.includes("replace-with")) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function readSheet() {
  log("sheet", "Reading Google Sheet CSV");
  const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.sheetName)}&cacheBust=${Date.now()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sheet fetch failed: ${response.status} ${response.statusText}`);
  const text = await response.text();
  if (/^[MP]K|^MZ/.test(text.slice(0, 2))) {
    throw new Error("Sheet endpoint returned binary content. Convert the source file to a native Google Sheet.");
  }

  const records = parseCsv(text);
  if (!records.length) throw new Error("Sheet is empty.");
  const { rawHeaders, headers, headerRepairs, dataStartIndex } = resolveHeaderRow(records);
  const normalizedHeaders = new Map(headers.map((header, index) => [normalizeHeader(header), { header, index }]));
  const missing = EXPECTED_HEADERS.filter((header) => !normalizedHeaders.has(normalizeHeader(header)));
  if (missing.length) {
    const error = new Error(`Sheet missing required columns: ${missing.join(", ")}`);
    error.parsedHeaders = rawHeaders;
    error.normalizedHeaders = rawHeaders.map(normalizeHeader);
    error.headerDiagnostics = rawHeaders.map((header) => ({
      header,
      codePoints: [...header].map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`),
    }));
    throw error;
  }

  const rows = records.slice(dataStartIndex).filter((row) => row.some((value) => String(value || "").trim())).map((values, index) => ({
    rowNumber: dataStartIndex + index + 1,
    values,
    headers,
    normalizedHeaders,
  }));

  log("sheet", `Found ${rows.length} data rows`);
  return { headers, rawHeaders, headerRepairs, rows };
}

function resolveHeaderRow(records) {
  const firstContentIndex = records.findIndex((row) => row.some((value) => String(value || "").trim()));
  if (firstContentIndex === -1) {
    throw new Error("Sheet is empty.");
  }

  if (looksLikeDataRow(records[firstContentIndex])) {
    return {
      rawHeaders: EXPECTED_HEADERS,
      headers: EXPECTED_HEADERS,
      headerRepairs: ["CSV did not include a header row; first row looked like data, so the expected schema was applied."],
      dataStartIndex: firstContentIndex,
    };
  }

  const embeddedHeaderRow = splitEmbeddedHeaderRow(records[firstContentIndex]);
  if (embeddedHeaderRow) {
    records[firstContentIndex] = embeddedHeaderRow.values;
    return {
      rawHeaders: embeddedHeaderRow.rawHeaders,
      headers: embeddedHeaderRow.headers,
      headerRepairs: ["First CSV row contained header labels embedded in data cells; stripped the labels and treated the row as data."],
      dataStartIndex: firstContentIndex,
    };
  }

  const rawHeaders = records[firstContentIndex].map((header) => String(header || ""));
  const cleanedHeaders = rawHeaders.map(cleanHeader);
  const { headers, headerRepairs } = repairHeaders(cleanedHeaders);
  return { rawHeaders, headers, headerRepairs, dataStartIndex: firstContentIndex + 1 };
}

function looksLikeDataRow(row) {
  return /^KW-\d+/i.test(String(row?.[0] || "").trim());
}

function splitEmbeddedHeaderRow(row) {
  if (!Array.isArray(row) || row.length < EXPECTED_HEADERS.length) return null;

  const headers = KNOWN_HEADERS.slice(0, row.length);
  const values = [];

  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    const header = headers[index];
    const cellValue = String(row[index] || "");
    const value = stripEmbeddedHeaderValue(cellValue, header);
    if (value === null) return null;
    values[index] = value;
  }

  for (let index = EXPECTED_HEADERS.length; index < row.length; index += 1) {
    const header = headers[index];
    const cellValue = String(row[index] || "");
    if (!header) {
      values[index] = cellValue;
      continue;
    }
    const value = stripEmbeddedHeaderValue(cellValue, header);
    values[index] = value === null ? cellValue : value;
  }

  if (isTemplatePlaceholder(values[headers.indexOf("WordPress URL")])) {
    values[headers.indexOf("WordPress URL")] = "";
  }

  if (!looksLikeDataRow(values)) return null;
  return { rawHeaders: headers, headers, values };
}

function isTemplatePlaceholder(value) {
  return /^example row\. replace with your first story\.?$/i.test(String(value || "").trim());
}

function stripEmbeddedHeaderValue(cellValue, header) {
  const value = String(cellValue || "").trimStart();
  const expectedPrefix = String(header || "");
  if (!value.toLowerCase().startsWith(expectedPrefix.toLowerCase())) return null;
  return value.slice(expectedPrefix.length).trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cellValue = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cellValue += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cellValue += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cellValue);
      cellValue = "";
    } else if (char === "\n") {
      row.push(cellValue.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cellValue = "";
    } else {
      cellValue += char;
    }
  }
  row.push(cellValue.replace(/\r$/, ""));
  rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return cleanHeader(header).toLowerCase().replace(/\s+/g, "_");
}

function cleanHeader(header) {
  return String(header || "").replace(/^\uFEFF/, "").replace(/^ï»¿/, "").trim();
}

// function repairHeaders(headers) {
//   const repaired = [...headers];
//   const repairs = [];
//   const hasBlankFirstColumn = repaired[0] === "";
//   const remainingHeadersMatch = EXPECTED_HEADERS
//     .slice(1)
//     .every((expected, index) => normalizeHeader(repaired[index + 1]) === normalizeHeader(expected));

//   if (hasBlankFirstColumn && remainingHeadersMatch) {
//     repaired[0] = "ID";
//     repairs.push("First CSV header was blank while remaining headers matched; treated column A as ID.");
//   }

//   return { headers: repaired, headerRepairs: repairs };
// }

function repairHeaders(headers) {
  const repaired = [...headers];
  const repairs = [];
  const hasBlankFirstColumn = repaired[0] === "";
  const remainingHeadersMatch = EXPECTED_HEADERS
    .slice(1)
    .every((expected, index) => normalizeHeader(repaired[index + 1]) === normalizeHeader(expected));

  if (hasBlankFirstColumn && remainingHeadersMatch) {
    repaired[0] = "ID";
    repairs.push("First CSV header was blank while remaining headers matched; treated column A as ID.");
    return { headers: repaired, headerRepairs: repairs };
  }

  const expectedByNormalized = new Map(
    EXPECTED_HEADERS.map((header) => [
      normalizeHeader(header),
      header,
    ])
  );

  const repairedHeaders = [];

  for (const originalHeader of repaired) {
    const cleaned = String(originalHeader || "").trim();
    const normalized = normalizeHeader(cleaned);
    if (expectedByNormalized.has(normalized)) {
      repairedHeaders.push(
        expectedByNormalized.get(normalized)
      );
      continue;
    }
    repairedHeaders.push(cleaned);
  }

  return {
    headers: repairedHeaders,
    headerRepairs: repairs,
  };
}

function cell(row, header) {
  const found = row.normalizedHeaders.get(normalizeHeader(header));
  if (!found) return "";
  return String(row.values[found.index] || "").trim();
}

async function buildContext(row) {
  const [categories, tags, posts] = await Promise.all([
    wpRequest("/wp/v2/categories?per_page=100&context=edit"),
    wpRequest("/wp/v2/tags?per_page=100&context=edit"),
    wpRequest("/wp/v2/posts?per_page=100&status=publish,draft,future&context=edit"),
  ]);
  return { categories, tags, posts };
}

function validateRow(row, context) {
  const errors = [];
  const id = cell(row, "ID");
  const title = cell(row, "Title");
  const story = cell(row, "Story");
  const category = cell(row, "Category");
  const status = cell(row, "Status");
  const wordpressUrl = cell(row, "WordPress URL");

  if (!id) errors.push("ID is required.");
  if (!title) errors.push("Title is required.");
  if (!story || story.replace(/\s+/g, "").length === 0) errors.push("Story is required.");
  if (!category) errors.push("Category is required.");
  if (status !== "Ready") errors.push(`Status must be exactly Ready; found ${status || "(empty)"}.`);
  if (wordpressUrl) errors.push("WordPress URL is already filled, so this row may already be published.");
  if (id && context.posts.some((post) => String(post.meta?.kw_story_id || "") === id)) {
    errors.push(`Story ID ${id} already exists in WordPress post meta.`);
  }

  return { ok: errors.length === 0, errors };
}

function validateUpdateRow(row) {
  const errors = [];
  const id = cell(row, "ID");
  const title = cell(row, "Title");
  const story = cell(row, "Story");
  const category = cell(row, "Category");
  const status = cell(row, "Status");
  const postId = getWordPressPostId(row);

  if (!id) errors.push("ID is required.");
  if (!title) errors.push("Title is required.");
  if (!story || story.replace(/\s+/g, "").length === 0) errors.push("Story is required.");
  if (!category) errors.push("Category is required.");
  if (status !== "Published") errors.push(`Update mode requires Status = Published; found ${status || "(empty)"}.`);
  if (!postId) errors.push("Update mode requires a valid WordPress Post ID column value.");

  return { ok: errors.length === 0, errors };
}

function getWordPressPostId(row) {
  const raw = cell(row, "WordPress Post ID") || cell(row, "wp_post_id") || cell(row, "Post ID");
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

async function prepareRow(row, context) {
  const id = cell(row, "ID");
  const title = cleanText(cell(row, "Title"));
  const story = cell(row, "Story");
  const categoryName = cleanText(cell(row, "Category"));
  const suppliedSeoTitle = cleanText(cell(row, "SEO Title"));
  const suppliedMetaDescription = cleanText(cell(row, "Meta Description"));
  const suppliedSlug = cleanText(cell(row, "Slug"));
  const suppliedTags = splitList(cell(row, "Tags"));

  const category = resolveCategory(categoryName, context.categories);
  const seoTitle = suppliedSeoTitle || generateSeoTitle(title);
  const metaDescription = suppliedMetaDescription || generateMetaDescription({ title, story, categoryName });
  const slug = suppliedSlug ? slugify(suppliedSlug) : await generateUniqueSlug(title, categoryName, id, context.posts);
  const excerpt = generateExcerpt(story);
  const tags = suppliedTags.length ? suppliedTags : generateTags({ title, story, categoryName });
  const tagIds = await resolveTags(tags, context.tags, { create: false });
  const internalLinks = selectInternalLinks({ categoryId: category.id, currentTitle: title, posts: context.posts });
  assertRawInternalLinks(internalLinks, "selectInternalLinks");
  const content = buildPostHtml({ story, internalLinks });
  assertGeneratedHrefs(content, "buildPostHtml");

  return {
    id,
    title,
    category: category.name,
    categoryId: category.id,
    tags,
    tagIds,
    seoTitle,
    metaDescription,
    slug,
    excerpt,
    internalLinks,
    wordpressPayload: {
      title,
      content,
      status: "publish",
      slug,
      excerpt,
      categories: [category.id],
      tags: tagIds,
      meta: {
        rank_math_title: seoTitle,
        rank_math_description: metaDescription,
        rank_math_focus_keyword: deriveFocusKeyword({ categoryName, title }),
        kw_story_id: id,
      },
    },
    warnings: tagIds.length < tags.length ? ["Some tags do not exist yet; production mode can create them safely."] : [],
  };
}

async function buildUpdatePlan(row, prepared) {
  const wordpressPostId = getWordPressPostId(row);
  const existingPost = await wpRequest(`/wp/v2/posts/${wordpressPostId}?context=edit`);
  if (Number(existingPost.id) !== Number(wordpressPostId)) {
    throw new Error(`Update safety assertion failed while loading post: requested ${wordpressPostId}, got ${existingPost.id}`);
  }

  const tagIds = await resolveTags(prepared.tags, await wpRequest("/wp/v2/tags?per_page=100&context=edit"), { create: false });
  const payload = {
    title: prepared.title,
    content: prepared.wordpressPayload.content,
    excerpt: prepared.excerpt,
    categories: prepared.wordpressPayload.categories,
    tags: tagIds,
    meta: prepared.wordpressPayload.meta,
  };

  return {
    mode,
    ok: true,
    applied: false,
    id: prepared.id,
    title: prepared.title,
    status: "Published",
    wordpressPostId,
    wordpressUrl: cell(row, "WordPress URL") || existingPost.link,
    existingSlug: existingPost.slug,
    targetEndpoint: `/wp-json/wp/v2/posts/${wordpressPostId}`,
    httpMethod: "POST",
    seoTitle: prepared.seoTitle,
    metaDescription: prepared.metaDescription,
    excerpt: prepared.excerpt,
    tags: prepared.tags,
    tagIds,
    internalLinks: prepared.internalLinks,
    generatedHtmlSummary: summarizeHtml(payload.content),
    wordpressPayload: payload,
    warnings: [
      ...prepared.warnings,
      "Dry-run only. Add --apply to update this existing post.",
      "Update mode preserves existing slug, URL, Published status, and WordPress Post ID.",
    ],
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitList(value) {
  return String(value || "")
    .split(/[,|]/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 8);
}

function resolveCategory(categoryName, categories) {
  const exact = categories.find((category) => category.name.toLowerCase() === categoryName.toLowerCase());
  if (exact) return exact;
  throw new Error(`Category does not exist in WordPress: ${categoryName}`);
}

function generateSeoTitle(title) {
  return limitAtWord(title, 68);
}

function generateMetaDescription({ title, story, categoryName }) {
  const titleText = cleanText(title);
  const theme = inferStoryTheme({ title: titleText, story, categoryName });
  const preferred = `${titleText} की कहानी में ${theme} का रोमांचक सफर पढ़ें.`;
  if (preferred.length <= 155) return preferred;
  return limitMetaDescription(`${titleText} - ${theme} पर आधारित हिंदी कहानी.`);
}

function generateExcerpt(story) {
  return limitAtWord(cleanText(story), 150);
}

function limitAtWord(text, maxLength) {
  const cleaned = cleanText(text);
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 80 ? clipped.slice(0, lastSpace) : clipped.slice(0, maxLength)).trim()}...`;
}

function limitMetaDescription(text) {
  const cleaned = cleanText(text);
  if (cleaned.length <= 155) return cleaned;
  const clipped = cleaned.slice(0, 154);
  const lastSpace = clipped.lastIndexOf(" ");
  const shortened = (lastSpace > 105 ? clipped.slice(0, lastSpace) : clipped).trim();
  return /[.!?।]$/.test(shortened) ? shortened : `${shortened}.`;
}

async function generateUniqueSlug(title, categoryName, id, posts) {
  const categoryPart = slugify(categoryName.replace(/stories?/gi, "story"));
  const transliterated = transliterateHindi(title);
  const titleSlug = slugify(transliterated);
  const preferred = buildDescriptiveSlug(titleSlug, categoryPart, id);
  let candidate = preferred.slice(0, 80).replace(/-+$/g, "");
  const existing = new Set(posts.map((post) => post.slug));
  let suffix = 2;
  while (existing.has(candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${preferred.slice(0, 80 - suffixText.length).replace(/-+$/g, "")}${suffixText}`;
    suffix += 1;
  }
  return candidate;
}

function buildDescriptiveSlug(titleSlug, categoryPart, id) {
  const titleTokens = titleSlug.split("-").filter(Boolean);
  const meaningfulTokens = titleTokens.filter((token) => !SLUG_STOPWORDS.has(token));
  const hasEnoughTitleContext = titleTokens.length >= 3 && meaningfulTokens.length >= 2;
  if (hasEnoughTitleContext) return titleTokens.slice(0, 10).join("-");

  const fallbackTokens = [
    ...titleTokens,
    ...categoryPart.split("-").filter(Boolean),
    slugify(id),
  ].filter(Boolean);
  return fallbackTokens.filter((token, index) => fallbackTokens.indexOf(token) === index).slice(0, 10).join("-");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function transliterateHindi(value) {
  const dictionary = new Map([
    ["भाभी", "bhabhi"], ["बहन", "behan"], ["मौसेरी", "mauseri"], ["कहानी", "kahani"],
    ["पहली", "pehli"], ["बार", "baar"], ["रात", "raat"], ["गांव", "gaon"],
    ["गाँव", "gaon"], ["देसी", "desi"], ["प्यास", "pyaas"], ["छुपी", "chhupi"],
    ["चाची", "chachi"], ["बारिश", "barish"], ["विधवा", "vidhwa"], ["रोमांटिक", "romantic"],
  ]);
  let text = String(value || "");
  for (const [hindi, latin] of dictionary) {
    text = text.replaceAll(hindi, ` ${latin} `);
  }
  return transliterateDevanagari(text);
}

function transliterateDevanagari(value) {
  const vowels = {
    अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऋ: "ri",
  };
  const marks = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
    "ं": "n", "ँ": "n", "ः": "h",
  };
  const consonants = {
    क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "ng",
    च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "ny",
    ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
    त: "t", थ: "th", द: "d", ध: "dh", न: "n",
    प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
    य: "y", र: "r", ल: "l", व: "v",
    श: "sh", ष: "sh", स: "s", ह: "h",
    ळ: "l", क्ष: "ksh", त्र: "tr", ज्ञ: "gy",
  };
  const chars = [...String(value || "")];
  let output = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const pair = `${char}${chars[index + 1] || ""}`;
    if (consonants[pair]) {
      output += consonants[pair];
      index += 1;
      continue;
    }
    if (vowels[char]) {
      output += vowels[char];
      continue;
    }
    if (consonants[char]) {
      const next = chars[index + 1] || "";
      output += consonants[char];
      if (!marks[next] && next !== "्") output += "a";
      continue;
    }
    if (marks[char]) {
      output += marks[char];
      continue;
    }
    if (char === "्" || char === "़") continue;
    output += char;
  }
  return output;
}

function generateTags({ title, story, categoryName }) {
  const source = `${title} ${story}`;
  const tags = new Set([categoryName.replace(/\s*Stories$/i, " Story")]);
  const candidates = [
    ["देसी", "Desi Kahani"],
    ["गांव", "Village Story"],
    ["गाँव", "Village Story"],
    ["बारिश", "Barish Ki Raat"],
    ["रोमांटिक", "Romantic Kahani"],
    ["भाभी", "Bhabhi Story"],
    ["चाची", "Chachi Story"],
    ["कॉलेज", "College Story"],
  ];
  for (const [needle, tag] of candidates) {
    if (source.includes(needle)) tags.add(tag);
  }
  tags.add("Hindi Story");
  return [...tags].slice(0, 5);
}

async function resolveTags(tags, existingTags, { create }) {
  const ids = [];
  for (const tag of tags) {
    const existing = existingTags.find((item) => item.name.toLowerCase() === tag.toLowerCase());
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    if (create) {
      const created = await wpRequest("/wp/v2/tags", { method: "POST", body: { name: tag, slug: slugify(tag) } });
      ids.push(created.id);
      existingTags.push(created);
    }
  }
  return ids;
}

function deriveFocusKeyword({ categoryName, title }) {
  if (/desi/i.test(categoryName)) return "desi hindi story";
  if (/village/i.test(categoryName)) return "village hindi story";
  if (/real/i.test(categoryName)) return "real hindi story";
  if (/romantic/i.test(categoryName)) return "romantic hindi story";
  if (title.includes("भाभी")) return "bhabhi hindi story";
  return "hindi adult story";
}

function selectInternalLinks({ categoryId, currentTitle, posts }) {
  const candidates = posts
    .filter((post) => post.status === "publish")
    .filter((post) => post.link)
    .filter((post) => cleanText(post.title?.raw || stripHtml(post.title?.rendered || "")) !== currentTitle);
  const sameCategory = candidates.filter((post) => post.categories?.includes(categoryId));
  return (sameCategory.length ? sameCategory : candidates)
    .slice(0, 3)
    .map((post) => {
      const url = sanitizeInternalUrl(post.link);
      assertRawUrl(url, `selectInternalLinks post ${post.id}`);
      return {
        title: post.title.raw || stripHtml(post.title.rendered || ""),
        url,
      };
    })
    .filter((link) => link.url);
}

function buildPostHtml({ story, internalLinks }) {

  /*
   * Clean text everywhere.
   * Handles:
   * - literal "\n"
   * - real line breaks
   * - extra spaces
   */
  function cleanContentText(value) {
    return cleanText(
      String(value || "")
        .replace(/\\n/g, " ")
        .replace(/\r\n/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  /*
   * Clean and validate internal links
   */
  const safeInternalLinks = internalLinks
    .map((link) => ({
      ...link,
      title: cleanContentText(link.title),
      url: sanitizeInternalUrl(link.url),
    }))
    .filter((link) => link.url && link.title);

  assertRawInternalLinks(safeInternalLinks, "buildPostHtml");


  /*
   * STORY CLEANING
   */
  const cleanStory = cleanContentText(story);


  /*
   * Split story into sentences.
   *
   * This works even when sentences are joined like:
   * "कहानी खत्म हुई।फिर वह घर गई।उसने..."
   *
   * So it does NOT depend on spaces after । . ! ?
   */
  const sentences = (
    cleanStory.match(/[^।.!?]+[।.!?]+|[^।.!?]+$/g) || []
  )
    .map((sentence) => cleanContentText(sentence))
    .filter(Boolean);


  /*
   * BUILD SMALL PARAGRAPHS
   *
   * Maximum 3 sentences per paragraph.
   */
  const paragraphGroups = [];

  for (let i = 0; i < sentences.length; i += 3) {

    const paragraph = cleanContentText(
      sentences.slice(i, i + 3).join(" ")
    );

    if (paragraph) {
      paragraphGroups.push(paragraph);
    }
  }


  const paragraphs = paragraphGroups
    .map(
      (paragraph) =>
        `<p>${escapeHtml(paragraph)}</p>`
    )
    .join("");


  /*
   * INTERNAL LINKS
   */
  const links = safeInternalLinks.length
    ? `<nav class="kw-story-links">
<strong>और कहानियां पढ़ें</strong>
<ul>
${safeInternalLinks
  .map(
    (link) =>
      `<li><a href="${escapeHtml(link.url)}">${escapeHtml(
        cleanContentText(link.title)
      )}</a></li>`
  )
  .join("")}
</ul>
</nav>`
    : "";

return `<article class="kw-story-post"><div class="kw-story-body">${paragraphs}</div>${inlineHtml(links)}</article>`;
}

function inlineHtml(value) {
  return String(value || "")
    .replace(/\\n/g, "")
    .replace(/[\r\n]+/g, "")
    .trim();
}

function summarizeHtml(html) {
  const text = String(html || "");
  return {
    characters: text.length,
    paragraphs: (text.match(/<p>/g) || []).length,
    internalLinkCount: (text.match(/<a href="/g) || []).length,
    hasStoryHighlight: /kw-story-highlight|कहानी की झलक/i.test(text),
    hasSeriesPlaceholder: /kw-series-box|Series \/ Parts/i.test(text),
    hrefs: Array.from(text.matchAll(/href="([^"]*)"/g)).map((match) => match[1]),
  };
}


function inferStoryTheme({ title, story, categoryName }) {
  const source = `${title} ${story}`;
  if (source.includes("गांव") || source.includes("गाँव") || /village/i.test(categoryName)) {
    return "गांव के माहौल, रिश्तों और छुपे एहसासों";
  }
  if (source.includes("कॉलेज")) return "कॉलेज लाइफ, दोस्ती और बदलते रिश्तों";
  if (source.includes("बारिश") || source.includes("रात")) return "रात, तन्हाई और गहरे जज़्बातों";
  if (source.includes("भाभी")) return "रिश्तों की नज़दीकियों और छुपी चाहत";
  if (source.includes("चाची")) return "परिवारिक माहौल और अनकहे आकर्षण";
  return "रिश्तों, भावनाओं और अनकहे आकर्षण";
}

function sanitizeInternalUrl(value) {
  const raw = String(value || "").trim();
  const siteUrl = new URL(config.siteUrl);
  const candidates = raw.match(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+/g) || [];
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/[.,;:]+$/g, "");
    if (/[()[\]]/.test(cleaned)) continue;
    try {
      const url = new URL(cleaned);
      if (url.hostname !== siteUrl.hostname) continue;
      return url.href;
    } catch {
      // Try the next extracted URL candidate.
    }
  }
  return "";
}

function assertRawInternalLinks(links, scope) {
  for (const link of links || []) {
    assertRawUrl(link.url, `${scope} internalLinks.url`);
  }
}

function assertRawUrl(url, scope) {
  if (!url) return;
  if (/[()[\]]/.test(String(url))) {
    throw new Error(`${scope} contains Markdown delimiters instead of a raw URL: ${url}`);
  }
}

function assertGeneratedHrefs(html, scope) {
  const hrefs = String(html || "").matchAll(/href="([^"]*)"/g);
  for (const href of hrefs) {
    assertRawUrl(href[1], `${scope} href`);
  }
}

async function checkDuplicates(prepared, context) {
  const errors = [];
  const slugConflict = context.posts.find((post) => post.slug === prepared.slug);
  if (slugConflict) errors.push(`Slug already exists on WordPress post ${slugConflict.id}: ${prepared.slug}`);

  const titleConflict = context.posts.find((post) => cleanText(post.title?.raw || stripHtml(post.title?.rendered || "")) === prepared.title);
  if (titleConflict) errors.push(`A post with the same title already exists: post ${titleConflict.id}`);

  return { ok: errors.length === 0, errors };
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function publishPost(prepared) {
  log("wp", `Publishing ${prepared.id} with slug ${prepared.slug}`);
  const tagIds = await resolveTags(prepared.tags, await wpRequest("/wp/v2/tags?per_page=100&context=edit"), { create: true });
  const payload = { ...prepared.wordpressPayload, tags: tagIds };
  return wpRequest("/wp/v2/posts", { method: "POST", body: payload });
}

async function updateExistingPost(updatePlan) {
  log("wp", `Updating existing post ${updatePlan.wordpressPostId} for ${updatePlan.id}`);
  const tagIds = await resolveTags(updatePlan.tags, await wpRequest("/wp/v2/tags?per_page=100&context=edit"), { create: true });
  const payload = { ...updatePlan.wordpressPayload, tags: tagIds };
  const updated = await wpRequest(`/wp/v2/posts/${updatePlan.wordpressPostId}`, { method: "POST", body: payload });
  if (Number(updated.id) !== Number(updatePlan.wordpressPostId)) {
    throw new Error(`Update safety assertion failed: requested post ${updatePlan.wordpressPostId}, got ${updated.id}`);
  }
  return updated;
}

async function verifyPublishedPage(url, prepared) {
  log("verify", url);
  const response = await fetch(`${url}?phase2Verify=${Date.now()}`);
  const html = await response.text();
  const errors = [];

  if (response.status !== 200) errors.push(`Expected HTTP 200, got ${response.status}.`);
  const canonical = match(html, /<link rel="canonical" href="([^"]+)"/i);
  const robots = match(html, /<meta name="robots" content="([^"]+)"/i);
  const title = match(html, /<title>(.*?)<\/title>/i);
  const description = match(html, /<meta name="description" content="([^"]+)"/i);
  const canonicalMatches = stripTrailingSlash(canonical) === stripTrailingSlash(`${config.siteUrl}/${prepared.slug}`);

  if (!canonical) errors.push("Canonical URL is missing.");
  if (canonical && !canonicalMatches) errors.push(`Canonical does not match generated slug: ${canonical}`);
  if (!robots || /noindex/i.test(robots)) errors.push(`Robots directive does not allow indexing: ${robots || "(missing)"}`);
  if (!title || !title.includes(prepared.title.slice(0, Math.min(18, prepared.title.length)))) errors.push("Expected SEO/page title was not found.");
  if (!description) errors.push("Meta description is missing.");
  const hasRankMathPostSchema = /Article|BlogPosting|NewsArticle/i.test(html);
  if (!hasRankMathPostSchema) errors.push("Rank Math post schema was not found.");
  if (!/BreadcrumbList/i.test(html)) errors.push("BreadcrumbList schema was not found.");
  if ((html.match(/rel="canonical"/gi) || []).length > 1) errors.push("Multiple canonical tags found.");

  return {
    ok: errors.length === 0,
    errors,
    checks: {
      httpStatus: response.status,
      canonical,
      robots,
      title,
      metaDescription: description,
      hasArticleSchema: hasRankMathPostSchema,
      hasBreadcrumbSchema: /BreadcrumbList/i.test(html),
      canonicalTagCount: (html.match(/rel="canonical"/gi) || []).length,
    },
  };
}

function match(text, regex) {
  return regex.exec(text)?.[1] || "";
}

async function updateSheetRow(result) {
  if (!config.sheetWebhookUrl || !config.sheetWebhookSecret) {
    log("sheet", "Writeback skipped: webhook is not configured.");
    return;
  }

  const update = {
    ID: result.id,
    Status: result.status,
    "WordPress URL": result.wordpressUrl || "",
    "SEO Title": result.seoTitle || "",
    "Meta Description": result.metaDescription || "",
    Slug: result.slug || "",
    "Error Log": result.errorLog || "",
    "WordPress Post ID": result.wordpressPostId || "",
    "Published Date": result.status === "Published"
      ? new Date().toISOString()
      : "",
    "Last Updated": new Date().toISOString(),
  };

  const payload = {
    secret: config.sheetWebhookSecret,
    updates: [update],
  };

  let response;

  try {
    response = await fetch(config.sheetWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
  } catch (error) {
    throw new Error(
      `Sheet writeback fetch failed: ${error.message}`
    );
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Sheet writeback failed: ${response.status} ${text.slice(0, 240)}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Sheet writeback returned non-JSON response: ${text.slice(0, 240)}`
    );
  }

  if (data.ok === false) {
    throw new Error(
      `Sheet writeback rejected: ${data.error || text}`
    );
  }

  log("sheet", `Writeback successful for ${result.id}`);
}

function failedResult(row, reason) {
  return {
    mode,
    ok: false,
    id: cell(row, "ID") || "",
    title: cell(row, "Title") || "",
    status: "Failed",
    errorLog: reason,
  };
}

async function wpRequest(endpoint, options = {}) {
  const token = Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`, "utf8").toString("base64");
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

async function withRetries(fn, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function redactReport(report) {
  return JSON.parse(JSON.stringify(report, (key, value) => {
    if (/password|secret|token|authorization/i.test(key)) return "[redacted]";
    return value;
  }));
}

function log(scope, message) {
  console.error(`[${new Date().toISOString()}] [${scope}] ${message}`);
}
