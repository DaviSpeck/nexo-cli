#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateFreeConvertRequest } from "./free-convert.js";
import { FREE_LIMITS } from "./free-limits.js";

type LogoTone = "dark" | "light";

type CliOptions = {
  output?: string;
  outputDir?: string;
  logo?: string;
  logoTone?: LogoTone;
  apiBaseUrl?: string;
  help: boolean;
};

type CliConfig = {
  defaultLogoPath?: string;
  defaultLogoTone?: LogoTone;
};

const DEFAULT_API_BASE_URL = "https://nexo.speck-solutions.com.br";
const DEFAULT_LOGO_TONE: LogoTone = "dark";
const CONFIG_DIR = join(homedir(), ".nexo");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function printHelp() {
  console.log(`nexo

Usage:
  nexo file.md
  nexo file.md --output ./output.pdf
  nexo a.md b.md c.md --output-dir ./pdfs
  nexo file.md --logo ./logo.svg --logo-tone light
  nexo file.md --api-base-url http://localhost:3000
  nexo config set-logo ./logo.svg --logo-tone light
  nexo config clear-logo
  nexo config show

Options:
  --output <file>          Write the output PDF to a specific path for one markdown file
  --output-dir <dir>       Output directory when converting multiple files
  --logo <file>            Optional logo (png, jpg, webp, or svg); overrides the saved default
  --logo-tone <dark|light> Header background tone for the logo (default: dark)
  --api-base-url <url>     NEXO API base URL (default: ${DEFAULT_API_BASE_URL})
  --help, -h               Show this help message

Rules:
  - Each conversion follows the same free-mode limits as the unauthenticated NEXO flow
  - Free mode accepts up to ${FREE_LIMITS.documents.maxFiles} .md files per CLI run
  - Without --output-dir, the PDF is saved next to the original file
  - Usage is tracked by the NEXO backend and marked with CLI as the source
  - A saved default logo can be configured once and reused automatically
  - Attachments are not supported in this CLI version
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
    throw new Error(`Unsupported file format in ${absolutePath}.`);
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
    logoTone: values["logo-tone"] === "light" || values["logo-tone"] === "dark"
      ? values["logo-tone"]
      : undefined,
    apiBaseUrl:
      typeof values["api-base-url"] === "string" ? values["api-base-url"] : undefined,
    help: Boolean(values.help)
  };
}

async function loadCliConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as CliConfig;
    return {
      defaultLogoPath:
        typeof parsed.defaultLogoPath === "string" ? parsed.defaultLogoPath : undefined,
      defaultLogoTone:
        parsed.defaultLogoTone === "light" || parsed.defaultLogoTone === "dark"
          ? parsed.defaultLogoTone
          : undefined
    };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveCliConfig(config: CliConfig) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function buildApiUrl(options: CliOptions) {
  const baseUrl = (options.apiBaseUrl || process.env.NEXO_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  return `${baseUrl}/api/free/convert`;
}

async function handleConfigCommand(args: string[], options: CliOptions) {
  const [action, value] = args;

  if (!action || options.help) {
    console.log(`nexo config

Usage:
  nexo config set-logo ./logo.svg --logo-tone light
  nexo config clear-logo
  nexo config show
`);
    return;
  }

  if (action === "set-logo") {
    if (!value) {
      throw new Error("Use `nexo config set-logo <file>`.");
    }

    const absoluteLogoPath = resolve(value);
    await encodeFileAsDataUrl(absoluteLogoPath);

    const currentConfig = await loadCliConfig();
    const nextConfig: CliConfig = {
      defaultLogoPath: absoluteLogoPath,
      defaultLogoTone: options.logoTone ?? currentConfig.defaultLogoTone ?? DEFAULT_LOGO_TONE
    };

    await saveCliConfig(nextConfig);

    console.log(`[nexo] Saved default logo: ${absoluteLogoPath}`);
    console.log(`[nexo] Saved default logo tone: ${nextConfig.defaultLogoTone}`);
    console.log(`[nexo] Config path: ${CONFIG_PATH}`);
    return;
  }

  if (action === "clear-logo") {
    await saveCliConfig({});
    console.log("[nexo] Cleared the saved default logo.");
    console.log(`[nexo] Config path: ${CONFIG_PATH}`);
    return;
  }

  if (action === "show") {
    const currentConfig = await loadCliConfig();
    console.log(`[nexo] Config path: ${CONFIG_PATH}`);
    if (!currentConfig.defaultLogoPath) {
      console.log("[nexo] No default logo configured.");
      return;
    }

    console.log(`[nexo] Default logo: ${currentConfig.defaultLogoPath}`);
    console.log(
      `[nexo] Default logo tone: ${currentConfig.defaultLogoTone ?? DEFAULT_LOGO_TONE}`
    );
    return;
  }

  throw new Error(`Unknown config command: ${action}`);
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
        : `Conversion failed (${response.status}).`;
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

  if (inputs[0] === "config") {
    await handleConfigCommand(inputs.slice(1), options);
    return;
  }

  if (options.help || inputs.length === 0) {
    printHelp();
    process.exit(inputs.length === 0 && !options.help ? 1 : 0);
  }

  if (options.output && inputs.length > 1) {
    throw new Error("Use --output only when converting a single .md file.");
  }

  if (inputs.length > FREE_LIMITS.documents.maxFiles) {
    throw new Error(
      `Free mode supports up to ${FREE_LIMITS.documents.maxFiles} markdown files per run. Received ${inputs.length}.`
    );
  }

  const cliConfig = await loadCliConfig();
  const effectiveLogoPath = options.logo ?? cliConfig.defaultLogoPath;
  const effectiveLogoTone = options.logoTone ?? cliConfig.defaultLogoTone ?? DEFAULT_LOGO_TONE;
  const customLogoData = effectiveLogoPath ? await encodeFileAsDataUrl(effectiveLogoPath) : null;
  let failures = 0;
  const total = inputs.length;

  console.log(
    `[nexo] Starting ${total} conversion${total === 1 ? "" : "s"} using ${buildApiUrl(options)}`
  );

  if (effectiveLogoPath) {
    const logoSource = options.logo ? "command line" : "saved config";
    console.log(`[nexo] Using logo from ${logoSource}: ${resolve(effectiveLogoPath)}`);
    console.log(`[nexo] Using logo tone: ${effectiveLogoTone}`);
  }

  for (const [index, inputPath] of inputs.entries()) {
    const absoluteInputPath = resolve(inputPath);
    const outputPath = deriveOutputPath(absoluteInputPath, options);

    try {
      console.log(`[${index + 1}/${total}] Reading ${absoluteInputPath}`);
      console.log(`[${index + 1}/${total}] Sending conversion request...`);

      const writtenOutputPath = await convertMarkdownFile(
        inputPath,
        { ...options, logoTone: effectiveLogoTone },
        customLogoData
      );
      console.log(`[ok] ${absoluteInputPath} -> ${writtenOutputPath}`);
    } catch (error) {
      failures += 1;
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${absoluteInputPath} -> ${reason}`);
      console.error(`[${index + 1}/${total}] Expected output path: ${outputPath}`);
    }
  }

  if (failures === 0) {
    console.log(`[nexo] Completed ${total} conversion${total === 1 ? "" : "s"} successfully.`);
  } else {
    console.error(
      `[nexo] Finished with ${failures} failure${failures === 1 ? "" : "s"} out of ${total} conversion${total === 1 ? "" : "s"}.`
    );
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

await main();
