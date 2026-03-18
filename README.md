# nexo-md-to-pdf-cli

CLI to convert Markdown files into corporate-ready PDFs with the NEXO document layout.

## Install

```bash
npm install -g nexo-md-to-pdf-cli
```

Or run without global install:

```bash
npx nexo-md-to-pdf-cli --help
```

## How it works

The CLI sends conversion jobs to the hosted NEXO API at `https://nexo.speck-solutions.com.br/api/free/convert`.

That means:

- PDFs are generated with the same backend used by the website
- free-mode limits stay aligned with the public product
- usage continues to be counted in Supabase
- the backend can distinguish CLI usage from website usage

## Usage

```bash
nexo release-summary.md
nexo release-summary.md --output ./release-summary.pdf
nexo a.md b.md c.md --output-dir ./pdfs
nexo release-summary.md --logo ./brand.svg --logo-tone light
nexo release-summary.md --api-base-url http://localhost:3000
```

## Free-mode limits

This package keeps the same unauthenticated limits used by the NEXO free flow:

- up to 3 Markdown documents per request
- up to 120,000 characters per document
- up to 180,000 characters total
- optional custom logo up to 2 MB
- accepted logo formats: `png`, `jpeg`, `webp`, `svg`

The CLI processes each input `.md` file as its own conversion job, which is convenient for batch usage while preserving the same per-conversion free-mode rules.

Attachments are intentionally out of scope for the current CLI version. For attachment-heavy workflows, use the NEXO web app.

## Development

```bash
yarn install
yarn build
node dist/cli.js --help
```

## License

MIT
