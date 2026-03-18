#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateFreeConvertRequest } from "./free-convert.js";

type CliOptions = {
  output?: string;
  outputDir?: string;
  logo?: string;
  logoTone: "dark" | "light";
  apiBaseUrl?: string;
  help: boolean;
};

const DEFAULT_API_BASE_URL = "https://nexo.speck-solutions.com.br";

function printHelp() {
  console.log(`nexo

Uso:
  nexo arquivo.md
  nexo arquivo.md --output ./saida.pdf
  nexo a.md b.md c.md --output-dir ./pdfs
  nexo arquivo.md --logo ./logo.svg --logo-tone light
  nexo arquivo.md --api-base-url http://localhost:3000

Opcoes:
  --output <arquivo>       Define o PDF de saida para um unico markdown
  --output-dir <pasta>     Pasta de saida quando houver varios arquivos
  --logo <arquivo>         Logo opcional (png, jpg, webp ou svg)
  --logo-tone <dark|light> Fundo da logo no cabecalho (padrao: dark)
  --api-base-url <url>     Base da API NEXO (padrao: ${DEFAULT_API_BASE_URL})
  --help, -h               Exibe esta ajuda

Regras:
  - Cada conversao respeita os mesmos limites do modo Free/nao autenticado da NEXO
  - Cada .md vira um PDF separado, o que facilita processamento em massa
  - Sem --output-dir, o PDF e salvo ao lado do arquivo original
  - O uso e contabilizado no backend da NEXO com origem identificada como CLI
  - Anexos nao sao suportados nesta versao da CLI
`);
}

function detectMimeType(filePath: string) {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "";
  }
}

async function encodeFileAsDataUrl(filePath: string) {
  const absolutePath = resolve(filePath);
  const mimeType = detectMimeType(absolutePath);
  if (!mimeType) {
    throw new Error(`Formato de arquivo nao suportado em ${absolutePath}.`);
  }

  const bytes = await readFile(absolutePath);
  return {
    fileName: basename(absolutePath),
    mimeType,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`
  };
}

function deriveOutputPath(inputPath: string, options: CliOptions) {
  if (options.output) return resolve(options.output);

  const inputAbsolutePath = resolve(inputPath);
  const outputDir = options.outputDir ? resolve(options.outputDir) : dirname(inputAbsolutePath);
  const outputFileName = `${basename(inputAbsolutePath, extname(inputAbsolutePath))}.pdf`;
  return join(outputDir, outputFileName);
}

function toCliOptions(values: Record<string, string | boolean | undefined>): CliOptions {
  return {
    output: typeof values.output === "string" ? values.output : undefined,
    outputDir: typeof values["output-dir"] === "string" ? values["output-dir"] : undefined,
    logo: typeof values.logo === "string" ? values.logo : undefined,
    logoTone: values["logo-tone"] === "light" ? "light" : "dark",
    apiBaseUrl:
      typeof values["api-base-url"] === "string" ? values["api-base-url"] : undefined,
    help: Boolean(values.help)
  };
}

function buildApiUrl(options: CliOptions) {
  const baseUrl = (options.apiBaseUrl || process.env.NEXO_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  return `${baseUrl}/api/free/convert`;
}

async function convertMarkdownFile(
  inputPath: string,
  options: CliOptions,
  customLogoData: Awaited<ReturnType<typeof encodeFileAsDataUrl>> | null
) {
  const absoluteInputPath = resolve(inputPath);
  const markdown = await readFile(absoluteInputPath, "utf8");
  const requestBody = {
    documents: [
      {
        markdown,
        fileName: basename(absoluteInputPath),
        attachments: []
      }
    ],
    ...(customLogoData
      ? {
          customLogo: {
            ...customLogoData,
            tone: options.logoTone
          }
        }
      : {})
  };

  const requestBytes = Buffer.byteLength(JSON.stringify(requestBody));
  validateFreeConvertRequest(requestBody, requestBytes);

  const response = await fetch(buildApiUrl(options), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-nexo-client-source": "cli"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : `Falha na conversao (${response.status}).`;
    throw new Error(message);
  }

  const pdfBytes = Buffer.from(await response.arrayBuffer());

  const outputPath = deriveOutputPath(absoluteInputPath, options);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}

async function main() {
  const parsed = parseArgs({
    options: {
      output: { type: "string" },
      "output-dir": { type: "string" },
      logo: { type: "string" },
      "logo-tone": { type: "string" },
      "api-base-url": { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    allowPositionals: true
  });

  const options = toCliOptions(parsed.values);
  const inputs = parsed.positionals;

  if (options.help || inputs.length === 0) {
    printHelp();
    process.exit(inputs.length === 0 && !options.help ? 1 : 0);
  }

  if (options.output && inputs.length > 1) {
    throw new Error("Use --output apenas quando houver um unico arquivo .md.");
  }

  const customLogoData = options.logo ? await encodeFileAsDataUrl(options.logo) : null;
  let failures = 0;

  for (const inputPath of inputs) {
    try {
      const outputPath = await convertMarkdownFile(inputPath, options, customLogoData);
      console.log(`[ok] ${resolve(inputPath)} -> ${outputPath}`);
    } catch (error) {
      failures += 1;
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[erro] ${resolve(inputPath)} -> ${reason}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

await main();
