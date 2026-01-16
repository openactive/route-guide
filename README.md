# route-guide [![Google Drive](https://img.shields.io/badge/Google%20Drive-4285F4?logo=google-drive&logoColor=white)](https://drive.google.com/drive/folders/1b0cn1wHNNfQtAkx_OJ2NZyuEtfJ3m_v5?usp=sharing)

Repo for discussion of the Routes and Routes Metadata aspects of the Modelling Opportunity Data specification.

## Overview

The Routes specification describes a proposed new type (`Route`) of `Opportunity`, as defined by the [OpenActive Modelling Opportunity Data 2.1](https://www.openactive.io/modelling-opportunity-data/EditorsDraft#describing-route-metadata-oa-routemetadata-) specification. Its purpose is to describe Routes used for recreational activities e.g. hiking, running, and cycling in sufficient detail to encourage greater use of these Routes.

## Status

The 2.1 Opportunity Model is still an Editors Draft: i.e., it is not finalised and is not yet at candidate status. Feedback and comment are actively solicited and encouraged.

### Contributing to the Discussion

Participants interested in contributing further to the discussion are encouraged to join the [OpenActive W3C community](https://w3c.openactive.io/), particularly the [mailing list](https://lists.w3.org/Archives/Public/public-openactive/) and [regular calls](https://w3c.openactive.io/meeting-calendar).

New proposals and discussion related to the Routes specification should be opened as GitHub Issues (i.e., by clicking 'Issues' in the tab menu above, and then the green 'New Issue' button on the resulting page).

## Building the specification

The specification has been authored using [the W3C respec tool](https://github.com/w3c/respec) using the markdown syntax option.

The editors draft is the primary working document. Once this has been reviewed and agreed for release, then it can be promoted to be the latest published version. At which point the publication date should be added to the document.

For live reloading of the document during editing, use browser-sync via the following:
```
npm install
npm run dev
```

The specification will be automatically deployed following a merge of a pull request into the master branch. This is handled by github actions, rendering the specifications to HTML and pushing them to the `gh-pages` branch of this repo.

## Further Information

Routes started life with this proposal [Modelling Opportunity Data Issue 108](https://github.com/openactive/modelling-opportunity-data/issues/108).

Materials related to the W3C calls discussing Routes on the dates below can be found at:

* [8 March 2019](https://w3c.openactive.io/meetings/2019-05-08-routes-and-accessibility-planning)
* [22 March 2019](https://w3c.openactive.io/meetings/2019-05-22-routes-data-exploration)
* [3 July 2019](https://w3c.openactive.io/meetings/2019-07-03-routes-workshop-preparation)
* [17 July 2019](https://w3c.openactive.io/meetings/2019-07-17-routes-workshop-follow-up)


