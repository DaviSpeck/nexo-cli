# NEXO CLI

Official command-line interface for converting Markdown files into polished PDFs using the hosted NEXO conversion API.

This package is designed for developers, technical writers, consultants, and teams that want the same PDF output available in the NEXO web product, but from scripts, terminals, CI jobs, or bulk local workflows.

## Why this exists

The NEXO web app is the best place for richer document workflows, previews, and attachment-heavy conversions. The CLI exists for a different use case:

- run conversions from the terminal
- automate repetitive document generation
- process multiple Markdown files quickly
- keep output consistent with the hosted NEXO product

Instead of generating PDFs locally with its own rendering stack, the CLI sends conversion jobs to the same backend used by the public NEXO experience.

That means:

- the PDF layout stays aligned with the product
- free-mode rules stay centralized
- usage is still tracked in the NEXO backend
- CLI traffic is identified separately from website traffic

## Install

Global install:

```bash
npm install -g nexo-md-to-pdf-cli
```

After installation, the command is:

```bash
nexo --help
```

You can also run it without a global install:

```bash
npx nexo-md-to-pdf-cli --help
```

## Quick start

Convert one Markdown file:

```bash
nexo release-summary.md
```

Write to a specific output path:

```bash
nexo release-summary.md --output ./release-summary.pdf
```

Convert several files at once:

```bash
nexo a.md b.md c.md --output-dir ./pdfs
```

Use a one-off custom logo:

```bash
nexo release-summary.md --logo ./brand.svg --logo-tone light
```

Save a default logo once and reuse it:

```bash
nexo config set-logo ./brand.svg --logo-tone light
nexo release-summary.md
```

Target another environment:

```bash
nexo release-summary.md --api-base-url http://localhost:3000
```

## How it works

By default, the CLI sends requests to:

```text
https://nexo.speck-solutions.com.br/api/free/convert
```

Each input `.md` file is converted into its own PDF output, but free mode is capped at 3 Markdown files per CLI run so the hosted limits remain consistent.

The CLI identifies itself with a dedicated request header, so the backend can distinguish:

- website usage
- CLI usage

This keeps metrics and operational visibility clean without splitting rendering logic across multiple codebases.

## Command reference

### Basic usage

```text
nexo <file.md>
nexo <file.md> --output <file.pdf>
nexo <file-a.md> <file-b.md> --output-dir <directory>
nexo config set-logo <file>
nexo config clear-logo
nexo config show
```

### Options

- `--output <file>`: write the generated PDF to a specific path for a single Markdown input
- `--output-dir <directory>`: choose the output directory when converting multiple files; free mode still allows at most 3 input files per command
- `--logo <file>`: provide an optional one-off logo in `png`, `jpg`, `webp`, or `svg`; this overrides the saved default
- `--logo-tone <dark|light>`: choose the logo header background tone, default is `dark`
- `--api-base-url <url>`: point the CLI to another NEXO environment such as local development or staging
- `-h, --help`: show command help

### Output behavior

- without `--output-dir`, the generated PDF is written next to the original Markdown file
- `--output` can only be used with a single Markdown input
- each input file generates one PDF
- the CLI exits with a non-zero status if one or more conversions fail

## Saved default logo

If you always use the same brand asset, you can save it once and stop repeating `--logo` in every command.

Set the default logo:

```bash
nexo config set-logo ./brand.svg --logo-tone light
```

Inspect the saved config:

```bash
nexo config show
```

Clear the saved logo:

```bash
nexo config clear-logo
```

After saving a default logo, plain conversions automatically reuse it:

```bash
nexo weekly-report.md
```

The CLI stores this configuration locally at:

```text
~/.nexo/config.json
```

If you pass `--logo` in a conversion command, that explicit file takes precedence over the saved default.

## Current scope

This first version of the CLI intentionally focuses on the most common command-line workflow:

- Markdown input
- optional custom logo, including a saved default logo
- hosted conversion through the NEXO API

The following are intentionally out of scope for now:

- attachments
- multi-asset document packaging
- interactive preview flows

For richer document assembly, use the web application at [nexo.speck-solutions.com.br](https://nexo.speck-solutions.com.br).

## Free-mode limits

The CLI follows the same unauthenticated limits enforced by the public NEXO free flow.

Current limits:

- up to 3 Markdown documents per CLI run
- up to 120,000 characters per document
- up to 180,000 characters total per request
- optional custom logo up to 2 MB
- accepted logo formats: `png`, `jpeg`, `webp`, `svg`

When converting multiple files, the CLI enforces the same free-mode ceiling before sending requests, so commands with more than 3 Markdown files are rejected immediately.

## Examples

Single document:

```bash
nexo weekly-report.md
```

Single document with explicit output:

```bash
nexo weekly-report.md --output ./exports/weekly-report.pdf
```

Bulk conversion:

```bash
nexo docs/release-1.md docs/release-2.md docs/release-3.md --output-dir ./exports
```

Saved default logo:

```bash
nexo config set-logo ./assets/brand.svg --logo-tone light
nexo docs/release-1.md
```

Local backend:

```bash
nexo weekly-report.md --api-base-url http://localhost:3000
```

## Error behavior

The CLI validates payloads before sending them and also surfaces hosted API errors clearly.

Typical failure cases include:

- unsupported logo file type
- using `--output` with more than one Markdown input
- exceeding hosted free-mode limits
- API errors returned by the NEXO backend
- network failures when the hosted service is unreachable

For successful conversions, the CLI prints a line like:

```text
[ok] /absolute/input.md -> /absolute/output.pdf
```

For failed conversions, it prints:

```text
[error] /absolute/input.md -> reason
```

## Development

Install dependencies:

```bash
yarn install
```

Type-check:

```bash
yarn typecheck
```

Build:

```bash
yarn build
```

Run locally without publishing:

```bash
node dist/cli.js --help
```

Test the command locally via npm linking:

```bash
npm link
nexo --help
```

## Relationship to the main NEXO repo

This repository contains the distributable CLI package.

The main NEXO product lives here:

- Website: [nexo.speck-solutions.com.br](https://nexo.speck-solutions.com.br)
- Main repository: [github.com/DaviSpeck/nexo](https://github.com/DaviSpeck/nexo)

If you want the browser experience, previews, richer document flows, or the primary product documentation, start from the main repository.

## License

[MIT](./LICENSE)
