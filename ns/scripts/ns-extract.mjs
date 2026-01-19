import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);
const ROOT = path.resolve(THIS_DIR, "..", "..");

const INPUT = path.join(ROOT, "EditorsDraft", "edit.html");
const OUTPUT = path.join(ROOT, "ns", "rt.jsonld");

function stripMarkdown(text) {
  return (text || "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqPush(list, value) {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

function normalizeQname(qname) {
  if (!qname) return null;
  const m = /^([A-Za-z][A-Za-z0-9_-]*):([A-Za-z0-9_]+)$/.exec(qname.trim());
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function parseRangeIncludes(typeCell) {
  const ranges = [];
  const t = (typeCell || "").trim();

  // Pick up qnames in links and inline code.
  const qnameRe = /([A-Za-z][A-Za-z0-9_-]*):([A-Za-z0-9_]+)/g;
  for (const match of t.matchAll(qnameRe)) {
    uniqPush(ranges, `${match[1]}:${match[2]}`);
  }

  // Pick up common primitives used in this spec.
  if (/\bBoolean\b/i.test(t)) uniqPush(ranges, "schema:Boolean");
  if (/\bInteger\b/i.test(t)) uniqPush(ranges, "schema:Integer");
  if (/\bString\b/i.test(t)) uniqPush(ranges, "schema:Text");
  if (/\bURI\b/i.test(t)) uniqPush(ranges, "schema:URL");
  if (/\bURL\b/i.test(t)) uniqPush(ranges, "schema:URL");

  return ranges;
}

function parseSubClassOf(sectionText) {
  // e.g. "subclass of [`schema:CreativeWork`](https://schema.org/CreativeWork)"
  const patterns = [
    /subclass of\s+\[\s*`?([A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9_]+)`?\s*\]\([^\)]+\)/i,
    /subclass of\s+`?([A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9_]+)`?/i,
  ];
  for (const re of patterns) {
    const m = re.exec(sectionText);
    if (m) return normalizeQname(m[1]);
  }
  return null;
}

function parseModelledUsingRange(sectionText) {
  // e.g. "modelled using `schema:CreativeWork`"
  const m = /modelled using\s+`?([A-Za-z][A-Za-z0-9_-]*:[A-Za-z0-9_]+)`?/i.exec(sectionText);
  return m ? normalizeQname(m[1]) : null;
}

function parseTableRows(lines, startIndex) {
  // Expects a markdown table header at startIndex.
  const rows = [];
  let i = startIndex + 1;
  // Skip separator row(s)
  while (i < lines.length && /^\|\s*-/.test(lines[i].trim())) i++;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) break;
    if (line.trim() === "|") break;

    const parts = line.split("|").slice(1, -1).map((p) => p.trim());
    if (parts.length < 3) continue;
    const [property, status, type, notes] = [
      parts[0] || "",
      parts[1] || "",
      parts[2] || "",
      parts[3] || "",
    ];
    rows.push({ property, status, type, notes });
  }

  return { rows, endIndex: i };
}

function findFirstTableHeader(lines, fromIndex) {
  for (let i = fromIndex; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^\|\s*Property\s*\|\s*Status\s*\|\s*Type\s*\|\s*Notes\s*\|\s*$/.test(t)) return i;
  }
  return -1;
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(line.trim());
}

function extractDescribingSections(lines) {
  const sections = [];

  const headingRe = /^(#{2,3})\s+Describing\s+.*\(\s*`?rt:([A-Za-z0-9_]+)`?\s*\)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const m = headingRe.exec(line);
    if (!m) continue;

    const level = m[1].length;
    const term = m[2];
    const start = i;

    // Find end: next heading of same or higher level (<= current level)
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (!isHeading(candidate)) continue;
      const candidateLevel = candidate.trim().match(/^#+/)?.[0]?.length ?? 7;
      if (candidateLevel <= level) {
        end = j;
        break;
      }
    }

    sections.push({ term, level, start, end, lines: lines.slice(start + 1, end) });
    i = end - 1;
  }

  return sections;
}

function sectionIntroText(sectionLines) {
  const introLines = [];
  for (const line of sectionLines) {
    if (/^\|\s*Property\s*\|\s*Status\s*\|/i.test(line.trim())) break;
    if (isHeading(line)) break;
    introLines.push(line);
  }

  // Take up to the first blank line block as a definition-ish sentence.
  const joined = introLines.join("\n");
  const paras = joined
    .split(/\n\s*\n/)
    .map((p) => stripMarkdown(p))
    .filter(Boolean);
  return paras.length ? paras[0] : "";
}

async function main() {
  const html = await fs.readFile(INPUT, "utf8");
  const $ = load(html, { decodeEntities: false });

  // EditorsDraft/edit.html is a Respec source document; the markdown-like content
  // is stored as text inside <section> blocks.
  const contentText = $("section").toArray().map((el) => $(el).text()).join("\n");
  const lines = contentText.split(/\r?\n/);

  const classNodesById = new Map();
  const propertyNodesById = new Map();

  const sections = extractDescribingSections(lines);

  for (const section of sections) {
    const term = section.term;
    const termId = `rt:${term}`;

    const joinedSection = section.lines.join("\n");
    const intro = sectionIntroText(section.lines);

    const isClass = /^[A-Z]/.test(term);
    const isProperty = /^[a-z]/.test(term);

    if (isClass) {
      const node = classNodesById.get(termId) ?? {
        "@id": termId,
        "@type": "rdfs:Class",
        "rdfs:label": term,
      };

      const subClassOf = parseSubClassOf(joinedSection);
      if (subClassOf) node["rdfs:subClassOf"] = subClassOf;

      if (intro) node["rdfs:comment"] = intro;

      classNodesById.set(termId, node);

      const tableHeaderIndex = findFirstTableHeader(section.lines, 0);
      if (tableHeaderIndex >= 0) {
        const { rows } = parseTableRows(section.lines, tableHeaderIndex);

        for (const row of rows) {
          const propMatch = /rt:([A-Za-z0-9_]+)/.exec(row.property);
          if (!propMatch) continue;

          const propName = propMatch[1];
          if (!/^[a-z]/.test(propName)) continue; // only rt properties

          const propId = `rt:${propName}`;
          const propertyNode = propertyNodesById.get(propId) ?? {
            "@id": propId,
            "@type": "rdf:Property",
            "rdfs:label": propName,
          };

          // domainIncludes
          const domain = propertyNode["schema:domainIncludes"];
          const domains = Array.isArray(domain) ? domain : domain ? [domain] : [];
          uniqPush(domains, termId);
          propertyNode["schema:domainIncludes"] = domains.length === 1 ? domains[0] : domains;

          // rangeIncludes
          const rangeIncludes = parseRangeIncludes(row.type);
          if (rangeIncludes.length) {
            const existing = propertyNode["schema:rangeIncludes"];
            const ranges = Array.isArray(existing) ? existing : existing ? [existing] : [];
            for (const r of rangeIncludes) uniqPush(ranges, r);
            propertyNode["schema:rangeIncludes"] = ranges.length === 1 ? ranges[0] : ranges;
          }

          // comment from notes
          const notes = stripMarkdown(row.notes);
          if (notes) propertyNode["rdfs:comment"] = notes;

          propertyNodesById.set(propId, propertyNode);
        }
      }
    }

    if (isProperty) {
      // Some sections describe a property (e.g. rt:userGeneratedContent). Capture its definition.
      const propertyNode = propertyNodesById.get(termId) ?? {
        "@id": termId,
        "@type": "rdf:Property",
        "rdfs:label": term,
      };

      if (intro) propertyNode["rdfs:comment"] = intro;

      const modelled = parseModelledUsingRange(joinedSection);
      if (modelled) {
        const existing = propertyNode["schema:rangeIncludes"];
        const ranges = Array.isArray(existing) ? existing : existing ? [existing] : [];
        uniqPush(ranges, modelled);
        propertyNode["schema:rangeIncludes"] = ranges.length === 1 ? ranges[0] : ranges;
      }

      propertyNodesById.set(termId, propertyNode);
    }
  }

  const graph = [
    ...Array.from(classNodesById.values()),
    ...Array.from(propertyNodesById.values()),
  ].sort((a, b) => (a["@id"] || "").localeCompare(b["@id"] || ""));

  const jsonld = {
    "@context": {
      rt: "https://openactive.io/route-guide/ns#",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      schema: "https://schema.org/",
      skos: "http://www.w3.org/2004/02/skos/core#",
      xsd: "http://www.w3.org/2001/XMLSchema#",
    },
    "@graph": graph,
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(jsonld, null, 2) + "\n", "utf8");

  console.log(`Wrote ${graph.length} terms to ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
