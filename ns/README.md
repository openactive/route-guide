# Route Guide Namespace

`ns/rt.jsonld` is the authoritative JSON-LD vocabulary file for the Route Guide namespace (`rt:` = `https://openactive.io/route-guide/ns#`).

## Regenerating `ns/rt.jsonld`

When `EditorsDraft/edit.html` changes, regenerate the vocabulary file:

```sh
npm run ns:extract
```

This parses the Route Guide specification source (`EditorsDraft/edit.html`) and extracts:
- `rdfs:Class` terms from “Describing … (`rt:SomeClass`)” sections
- `rdf:Property` terms from the property tables that follow those sections

## Building the namespace website

Generate the static namespace website into `out/ns/`:

```sh
npm run ns:build
```

Outputs:
- `out/ns/index.html`
- `out/ns/<Term>/index.html` (one per class/property)
- `out/ns/assets/namespace.css`

## Publishing

`deploy.sh` runs `npm run ns:build` during the GitHub Pages build, so `out/ns/**` is included in what gets pushed to `gh-pages`.
