import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import jsonld from "jsonld";
import { Parser as N3Parser, Writer as N3Writer } from "n3";

const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);
const ROOT = path.resolve(THIS_DIR, "..", "..");

const INPUT = path.join(ROOT, "ns", "rt.jsonld");
const OUT_DIR = path.join(ROOT, "out", "ns");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function qnameParts(id) {
  if (typeof id !== "string") return null;
  const idx = id.indexOf(":");
  if (idx < 0) return null;
  return { prefix: id.slice(0, idx), name: id.slice(idx + 1) };
}

function hrefForId(id, pageKind) {
  // pageKind: "index" or "term" (affects relative links to other terms)
  const parts = qnameParts(id);
  if (!parts) return null;

  if (parts.prefix === "rt") {
    return pageKind === "index" ? `./${parts.name}/` : `../${parts.name}/`;
  }
  if (parts.prefix === "schema") return `https://schema.org/${parts.name}`;
  if (parts.prefix === "skos") return `http://www.w3.org/2004/02/skos/core#${parts.name}`;
  if (parts.prefix === "rdf") return `http://www.w3.org/1999/02/22-rdf-syntax-ns#${parts.name}`;
  if (parts.prefix === "rdfs") return `http://www.w3.org/2000/01/rdf-schema#${parts.name}`;

  return null;
}

function renderLinkedQname(id, pageKind) {
  const parts = qnameParts(id);
  if (!parts) return escapeHtml(String(id));
  const href = hrefForId(id, pageKind);
  const label = `${parts.prefix}:${parts.name}`;
  return href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : escapeHtml(label);
}

function renderLayout({ title, basePath, contentHtml }) {
  // Mirrors openactive/openactive.github.io/_layouts/default.html markup,
  // with only internal links made relative and stylesheet path adjusted.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" type="text/css" href="${escapeHtml(basePath)}/assets/namespace.css" />
  </head>
  <body>
    <div id="container">
      <div id="intro">
        <div id="pageHeader">
          <div class="wrapper">
            <div id="sitename">
            <h1>
              <a href="${escapeHtml(basePath)}/">OpenActive Route Guide Vocabulary</a>
            </h1>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="selectionbar">
      <div class="wrapper">
        <ul>
          <li>
            <a href="https://openactive.io/">About OpenActive</a>
          </li>
          <li>
            <a href="https://w3c.openactive.io/">W3C Community Group</a>
          </li>
          <li>
            <a href="https://developer.openactive.io/">Documentation</a>
          </li>
          <li>
            <a href="${escapeHtml(basePath)}/">Vocabulary Terms</a>
          </li>
        </ul>
      </div>
    </div>
    <div id="mainContent">
      ${contentHtml}
    </div>
    <div id="footer">
      <p>OpenActive data models build on top of <a href="https://schema.org/">schema.org</a></p>
    </div>
  </body>
</html>
`;
}

function sortByName(a, b) {
  const an = (qnameParts(a["@id"])?.name || "").toLowerCase();
  const bn = (qnameParts(b["@id"])?.name || "").toLowerCase();
  return an.localeCompare(bn);
}

function termKey(t) {
  if (!t) return "";
  return `${t.termType}:${t.value || ""}`;
}

function quadKey(q) {
  return `${termKey(q.subject)} ${termKey(q.predicate)} ${termKey(q.object)} ${termKey(q.graph)}`;
}

async function jsonldToTurtle(doc) {
  const nquads = await jsonld.toRDF(doc, { format: "application/n-quads" });
  const parser = new N3Parser({ format: "N-Quads" });
  const quads = parser.parse(nquads).sort((a, b) => quadKey(a).localeCompare(quadKey(b)));

  const context = doc && typeof doc === "object" ? doc["@context"] : null;
  const prefixes = context && typeof context === "object" && !Array.isArray(context) ? context : undefined;

  const writer = new N3Writer({ format: "Turtle", prefixes });
  writer.addQuads(quads);

  const ttl = await new Promise((resolve, reject) => {
    writer.end((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  return ttl.endsWith("\n") ? ttl : `${ttl}\n`;
}

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function copyFileEnsured(srcPath, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(srcPath, destPath);
}

async function main() {
  const json = JSON.parse(await fs.readFile(INPUT, "utf8"));
  const graph = Array.isArray(json["@graph"]) ? json["@graph"] : [];

  const classes = graph.filter((n) => n?.["@type"] === "rdfs:Class").sort(sortByName);
  const properties = graph.filter((n) => n?.["@type"] === "rdf:Property").sort(sortByName);

  // CSS
  const css = `/* Minimal namespace styling (Node-built, no Jekyll) */
/* Ported/compatible styling for OpenActive vocabulary pages.
   Intentionally keeps IDs/classes aligned with openactive.github.io layout. */
/* -- page structure -- */
#container
{
width: 100%;
text-align: left;
margin: 0;
background: #fff;
}
#intro
{
position: relative;
}
#mainContent
{
border-bottom: solid 1px #CCCCCC;
text-align: left;
}
#footer
{
text-align: right;
font-size: x-small;
}
#mainContent, #footer, .wrapper {
  margin: 0 auto !important;
  padding: 0 0.5em;
}

/* -- general -- */
body
{
color: #000;
background: #FFF;
font-family: montserrat,sans-serif;
line-height: 160%;
margin: 0;
padding: 0;
text-align: center;
}
code
{
font-family: Courier, monospace;
}
h1
{
font: bold 24px montserrat,sans-serif;
color: #000;
letter-spacing: -1px;
margin: 0.25em 0 0 0;
}

h2 {
padding-top: 5px;
clear: both;
color: #000;
font: normal 18px montserrat,sans-serif;
margin: 2em 0 0 0;
}
h3 {
font-size: 12px;
color: #000;
margin: 1em 0 0 0;
position: relative;
top: 8px;
}

h4
{
font-size: 100%;
margin: 0.5em 0 1em 0;
position: relative;
}
*/
hr
{
border: none;
height: 1px;
background: #ccc;
margin: 2em 0 4em 0;
}
p
{
margin: 1em 0 0 0;
}
pre
{
font-family: Courier, monospace;
font-size: 120%;
background: #E1E1E1;
width: auto;
padding: 5px 5px 5px 10px;
margin: 1em 0 0 0;
text-align: left;
overflow: auto;
}

/* -- header/title -- */
#pageHeader
{
width: 100%;
height: 80px;
background: #223582;
}
#pageHeader h1
{
color: #fff;
margin: 0;
padding-top: 25px;
font: bold Helvetica, Arial, sans-serif;
letter-spacing: -1px;
}
#pageHeader a:link, #pageHeader a:hover, #pageHeader a:visited
{
color: #fff;
background-color: #223582;
text-decoration: none;
}

#cse-search-form {
  float: right;
  margin-top:20px;
  width: 255px !important;
}
@media all and (max-width: 720px) {
  #pageHeader {
    height: 120px;
  }
  #cse-search-form {
    margin-left: 15px;
    margin-top: 20px;
  }
}

/* -- nav bar -- */
#selectionbar
{
color: #fff;
height: 46px;
background: #0065af;
font-size: 90%;
margin-bottom: 30px;
}
#selectionbar ul
{
  float: right;
  padding: 10px 0;
  margin: 0 auto;
  display: block;
}
#selectionbar li
{
display: inline;
list-style: none;
}
#selectionbar a:link, #selectionbar a:visited
{
color: #fff;
display: block;
float: right;
padding: 1px 9px 3px 6px;
margin: 0 6px;
text-decoration: none;
}
#selectionbar a:hover
{
color: #FFEE99;
background-color: transparent;
}
#selectionbar .activelink a
{
background: #0065af;
}
#selectionbar .activelink a:hover
{
color: #fff;
background-color: #0065af;
cursor: default;
}


/* -- main content -- */
#mainContent
{
font-size: 100%;
}
#mainContent ul li
{
list-style: inherit;
padding: 0 0 0 5px;
margin: 0;
}
a:link
{
color: rgb(67, 58, 143);
text-decoration: none;
border-bottom: dotted 1px rgb(0, 101, 175);
}
a:visited
{
color: rgb(67, 58, 143);
text-decoration: none;
border-bottom: dotted 1px rgb(67, 58, 143);
}
a:hover
{
border-bottom: none;
color: #fff;
background-color: rgb(0, 101, 175);
text-decoration: none;
}
#mainContent blockquote
{
padding: 0 0 0 15px;
margin: 10px 0 10px 15px;
width: auto;
float: right;
border-left: thin dotted #000;
}


/* -- faq -- */
.faq p, .faq pre, .faq ul, .faq table, .faq
{
margin: .5em 0 0 50px;
padding-top: 0px;
padding-bottom: 2px;
}
.faq h1
{
margin-bottom: 1em;
}
.faq ul, .faq ol
{
padding-left: 30px;
margin-left: 50px;
}
#mainContent .question
{
font-weight: bold;
margin: 1.5em 0 0 0;
padding-top: 0px;
padding-bottom: 2px;
}

/* -- types -- */
table.definition-table
{
margin: 1em 0 0 0;
border: 1px solid #98A0A6;
}
.definition-table th
{
text-align: left;
background: #C7CBCE;
padding-left: 5px;
}
.definition-table td
{
padding: 0 5px 2px 5px;
margin: 0;
vertical-align: top;
}
.definition-table td p
{
padding: 0 0 .6em 0;
margin: 0;
}
.definition-table td ul
{
padding-top: 0;
margin-top: 0;
}
.definition-table tr.alt
{
background: #E9EAEB;
}
div.attrib
{
padding-bottom: 1em;
}

/* -- hierarchy -- */
table.h, .h tr, .h td
{
border: none;
margin: 0;
padding: 0;
border-collapse: collapse
}
.h .space
{
width: 20px
}
.h .bar
{
background-color: #000;
width: 1px
}
.h .tc
{
text-indent: -21px;
padding-left: 21px
}

/* -- other -- */
.backtotop, .faq .backtotop
{
float: right;
clear: both;
padding: 3em 0 0 4em;
padding: 0;
font-size: 90%;
}
.date, .faq .date
{
color: #BFC3C7;
text-align: right;
font-size: x-small;
clear: both;
padding-top: 4em;
}
.version
{
color: #BFC3C7;
text-align: right;
font-size: x-small;
clear: both;
padding-top: 1em;
}

#selectionbar ul
{
float: right;
padding: 10px 0;
}
#sitename {
    max-width: 500px;
    min-width: auto;
	display: inline-block;
    text-shadow: 0 2px 0 #510000;
    padding: 0;
    top: 25px; left: -40px;
}
#selectionbar ul {
  margin: 0 auto;
  display: block;
}
gsc-input input.gsc-input { background: #FFF !important;}

@media all and (max-width: 720px) {
  #pageHeader {
    height: 120px;
  }
  #cse-search-form {
    margin-left: 15px;
    margin-top: 20px;
  }
}

/* -- extras -- */

input.gsc-input {
  border-color: #660000;
  color: #333333;
  font-family: "Lucida Grande" , "Lucida Sans Unicode" , Verdana, Tahoma, Arial, sans-serif;
  font-size: 11px;
  padding: 3px;
  width: 99%;
}
input.gsc-search-button {
  background-color: #660000;
  border-color: #660000;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  font-weight: normal;
  padding: 2px 8px;
  text-shadow: none;
}
.gsc-input input.gsc-input {
  background: none repeat scroll 0% 0% white !important;
  border-color: #660000;
  padding: 3px;
  width: 99%;
}
.gsc-clear-button {
  display: none;
}

/* example tab selection */
.ds-selector-tabs {
  padding-bottom: 2em;
}
.ds-selector-tabs .selectors {
  padding: 0;
  border-bottom: 1px solid #ccc;
  height: 28px;
}
.ds-selector-tabs .selectors a {
  display: inline-block;
  min-width: 54px;
  text-align: center;
  font-size: 11px;
  font-weight: bold;
  height: 27px;
  padding: 0 8px;
  line-height: 27px;
  transition: all,0.218s;
  border-top-right-radius: 2px;
  border-top-left-radius: 2px;
  color: #666;
  border: 1px solid transparent;
}
.ds-selector-tabs .selectors a:first-child {
  margin-left: 2px;
}
.ds-selector-tabs .selectors a.selected {
  color: #202020 !important;
  border: 1px solid #ccc;
  border-bottom: 1px solid #fff !important;
}
#mainContent .ds-selector-tabs .selectors a:hover {
  background-color: transparent;
  color: #202020;
  cursor: pointer;
}
.ds-selector-tabs pre {
  display: none;
}
.ds-selector-tabs pre.selected {
  display: block;
}

/* Clickable Anchor links */
a.clickableAnchor:link {
   color: #3A4956 !important;
   border-bottom: 0px !important;
   text-decoration: none;
}
a.clickableAnchor:visited {
    color: #3A4956 !important;
    border-bottom: 0px !important;
    text-decoration: none;
}
a.clickableAnchor:hover {
   color: #fff !important;
   background-color: #3A4956 !important;
   border-bottom: 0px !important;
   text-decoration: none;
}
/* Extension links */
a.ext:link {
   color: #0000aa !important;
   border-bottom: dotted 1px #0000aa !important;
   text-decoration: none;
}
a.ext:visited {
   color: #0000cc !important;
   border-bottom: dotted 1px #0000cc !important;
   text-decoration: none;
}
a.ext:hover {
   color: #fff !important;
   background-color: #0000cc;
   text-decoration: none;
}
/* External links */
a.externlink:link {
   color: #000 !important;
   border-bottom: dotted 1px #000 !important;
   text-decoration: none;
}
a.externlink:visited {
   color: #000 !important;
   border-bottom: dotted 1px #000 !important;
   text-decoration: none;
}
a.externlink:hover {
   color: #fff !important;
   background-color: #000;
   text-decoration: none;
}

/* Attic extension links overriding default 'ext' values */
a.ext.ext-attic:link{
   color: #888888 !important;
   border-bottom: dotted 1px #888888 !important;
   text-decoration: none;
}
a.ext.ext-attic:visited {
   color: #888888 !important;
   border-bottom: dotted 1px #888888 !important;
   text-decoration: none;
}
a.ext.ext-attic:hover {
   color: #fff !important;
   background-color: #bbbbbb;
   text-decoration: none;
}




.layerinfo {
    width: 100%; /* compatibility */
    background-color: #990000;
    color: #fff;
    text-align: right;
    font-weight: bold;
    padding: 0.7em;
}
#lli a:link {  text-decoration: underline; color : #fff;  background-color: #990000; text-decoration: none; }
#lli a:visited {  text-decoration: underline; color : #fff;  background-color: #990000; text-decoration: none; }


/* Style overrides based on sitemode */

.testsite {

    color: black;
    background-color: #EEE;

/*
  color: green;
  background-color: #DDFF00;
  background: #DDFF00;
  font-weight: 900;
  background-image: url(draft.jpg);
  background-repeat:repeat;
*/

}

.needsreview {

  background-color: #FAEBD7;

}

.devnote {
  padding: 0.7em;
  background-color:#d9edf7;
  color: #000;
  border: 1px solid #bce8f1;
}

.pendnote {
  padding: 0.7em;
  background-color:#fcf8e3;
  color: #000;
  border: 1px solid #faebcc;
}

.extlink {
    font-size: 85%;
}
.tag    { color: #000; }    /* div, span, etc   */
.atn    { color: #000; }    /* href, datetime,  */
.custom { color: #660003; } /* itemscope, itemtype, etc,. */

@media (max-width: 640px) {
  table.definition-table th, table.definition-table td {
    display: inline-block;
  }
  table.definition-table br {
    display: none;
  }
}

@media (min-width: 960px) {
  #mainContent, #footer, .wrapper {
    max-width: 960px;
    padding: 0 1em 1em 1em
  }
}
`;

  await writeFileEnsured(path.join(OUT_DIR, "assets", "namespace.css"), css);

  // Copy the authoritative JSON-LD into the published namespace folder.
  await copyFileEnsured(INPUT, path.join(OUT_DIR, "rt.jsonld"));

  // Generate a Turtle representation alongside JSON-LD.
  // const ttl = await jsonldToTurtle(json);
  // await writeFileEnsured(path.join(OUT_DIR, "rt.ttl"), ttl);

  // index.html
  const classesList = classes
    .map((n) => {
      const name = qnameParts(n["@id"])?.name;
      return `<li><a href="./${escapeHtml(name)}/">${escapeHtml(name)}</a></li>`;
    })
    .join("\n");

  const propsList = properties
    .map((n) => {
      const name = qnameParts(n["@id"])?.name;
      return `<li><a href="./${escapeHtml(name)}/">${escapeHtml(name)}</a></li>`;
    })
    .join("\n");

  const indexContent = `
<h1>OpenActive Route Guide Vocabulary Terms</h1>
<p>The terms in the vocabulary listed below are defined within the <a href="https://openactive.io/route-guide/EditorsDraft/">Route Guide</a> specification.</p>
<p>These specifications are being developed by the <a href="https://www.w3.org/community/openactive">OpenActive W3C Community Group</a>.</p>
<p>This vocabulary is also available via the URL <a href="https://openactive.io/route-guide/ns/rt.jsonld"><code>"https://openactive.io/route-guide/ns/rt.jsonld"</code></a> for production use.</p>
<p>For more information, see the <a href="https://developer.openactive.io/">developer documentation</a>.</p>

<h2>Classes</h2>
<ul>
${classesList}
</ul>

<h2>Properties</h2>
<ul>
${propsList}
</ul>
`;

  await writeFileEnsured(
    path.join(OUT_DIR, "index.html"),
    renderLayout({ title: "Route Guide Vocabulary Terms", basePath: ".", contentHtml: indexContent })
  );

  // Term pages
  for (const node of [...classes, ...properties]) {
    const id = node["@id"];
    const parts = qnameParts(id);
    if (!parts || parts.prefix !== "rt") continue;

    const termName = parts.name;
    const isClass = node["@type"] === "rdfs:Class";

    const comment = node["rdfs:comment"] ? `<p>${escapeHtml(String(node["rdfs:comment"]))}</p>` : "";

    let metaHtml = "";

    if (isClass) {
      const parents = toArray(node["rdfs:subClassOf"]).filter(Boolean);
      if (parents.length) {
        metaHtml += `<p><strong>Inherits from:</strong> ${parents
          .map((p) => renderLinkedQname(p, "term"))
          .join(", ")}</p>`;
      }
    } else {
      const domains = toArray(node["schema:domainIncludes"]).filter(Boolean);
      const ranges = toArray(node["schema:rangeIncludes"]).filter(Boolean);

      if (domains.length) {
        metaHtml += `<p><strong>This property can be used on:</strong> ${domains
          .map((d) => renderLinkedQname(d, "term"))
          .join(", ")}</p>`;
      }

      if (ranges.length) {
        metaHtml += `<p><strong>This property may include the values:</strong> ${ranges
          .map((r) => renderLinkedQname(r, "term"))
          .join(", ")}</p>`;
      }
    }

    if (metaHtml) metaHtml = `<div class="term-meta">${metaHtml}</div>`;

    const termContent = `
<h1>${escapeHtml(termName)}</h1>
${comment}
${metaHtml}
`;

    await writeFileEnsured(
      path.join(OUT_DIR, termName, "index.html"),
      renderLayout({ title: `Route Guide Vocabulary: ${termName}`, basePath: "..", contentHtml: termContent })
    );
  }

  console.log(`Wrote namespace site to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
