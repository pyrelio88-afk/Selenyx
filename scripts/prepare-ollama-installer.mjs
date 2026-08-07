import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(import.meta.dirname, '..');
const resourcesDirectory = join(root, 'desktop', 'resources', 'ollama');
const manifestPath = join(resourcesDirectory, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (
  typeof manifest.fileName !== 'string'
  || typeof manifest.version !== 'string'
  || typeof manifest.sourceUrl !== 'string'
  || !Number.isSafeInteger(manifest.expectedSizeBytes)
  || manifest.expectedSizeBytes <= 0
  || !/^[a-f0-9]{64}$/i.test(manifest.sha256 ?? '')
) {
  throw new Error(`Invalid optional Ollama manifest: ${manifestPath}`);
}
const installer = {
  fileName: manifest.fileName,
  version: manifest.version,
  sourceUrl: manifest.sourceUrl,
  sizeBytes: manifest.expectedSizeBytes,
  sha256: manifest.sha256.toLowerCase(),
};
const cacheDirectory = join(root, 'desktop', '.cache', 'ollama');
const installerPath = join(resourcesDirectory, installer.fileName);
const argv = process.argv.slice(2);

function printUsage() {
  console.log(`Usage: node scripts/prepare-ollama-installer.mjs --with-ollama | --verify\n\nThe download is deliberately opt-in. It streams the pinned Windows Ollama ${installer.version}\ninstaller and accepts it only when both its exact byte size and SHA-256 match.\n\n  --with-ollama  Download and stage the verified installer.\n  --verify       Verify an existing bundled installer without downloading anything.`);
}

if (argv.includes('--help') || argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const unknownArguments = argv.filter((argument) => argument !== '--verify' && argument !== '--with-ollama');
if (unknownArguments.length > 0) {
  throw new Error(`Unknown Ollama preparation option(s): ${unknownArguments.join(', ')}. Use --help for usage.`);
}

if (platform() !== 'win32') {
  throw new Error('The pinned OllamaSetup.exe resource can only be prepared on Windows.');
}

const verifyOnly = argv.includes('--verify');
const withOllama = argv.includes('--with-ollama');

if (verifyOnly === withOllama) {
  throw new Error('Choose exactly one Ollama preparation mode: --with-ollama or --verify.');
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

async function fingerprint(filePath) {
  const hash = createHash('sha256');
  let bytes = 0;

  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }

  return { bytes, sha256: hash.digest('hex') };
}

async function validateInstaller(filePath) {
  if (!existsSync(filePath)) {
    return { valid: false, reason: 'installer file is missing' };
  }

  const actualSize = statSync(filePath).size;
  if (actualSize !== installer.sizeBytes) {
    return {
      valid: false,
      reason: `unexpected file size ${actualSize}; expected ${installer.sizeBytes}`,
    };
  }

  const actual = await fingerprint(filePath);
  if (actual.sha256 !== installer.sha256) {
    return {
      valid: false,
      reason: `SHA-256 mismatch (${actual.sha256})`,
    };
  }

  return { valid: true, bytes: actual.bytes, sha256: actual.sha256 };
}

async function downloadInstaller() {
  console.log(`Downloading Ollama ${installer.version} for Windows (${formatBytes(installer.sizeBytes)})...`);
  const response = await fetch(installer.sourceUrl, {
    headers: { 'User-Agent': 'Selenyx-optional-ollama-packager/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Ollama download failed with HTTP ${response.status} ${response.statusText}.`);
  }
  if (!response.body) {
    throw new Error('Ollama download response did not include a body.');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) !== installer.sizeBytes) {
    throw new Error(`Ollama download advertised ${contentLength} bytes; expected ${installer.sizeBytes}.`);
  }

  mkdirSync(cacheDirectory, { recursive: true });
  const temporaryPath = join(cacheDirectory, `${installer.fileName}.${process.pid}.${Date.now()}.partial`);
  const hash = createHash('sha256');
  let receivedBytes = 0;
  let lastPrintedPercent = -5;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > installer.sizeBytes) {
        callback(new Error('Ollama download exceeded its pinned expected size.'));
        return;
      }

      hash.update(chunk);
      const percent = Math.floor((receivedBytes / installer.sizeBytes) * 100);
      if (percent >= lastPrintedPercent + 5 || percent === 100) {
        lastPrintedPercent = percent;
        console.log(`  ${percent}% (${formatBytes(receivedBytes)} / ${formatBytes(installer.sizeBytes)})`);
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      progress,
      createWriteStream(temporaryPath, { flags: 'wx' }),
    );
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }

  const actualHash = hash.digest('hex');
  if (receivedBytes !== installer.sizeBytes) {
    rmSync(temporaryPath, { force: true });
    throw new Error(`Ollama download was ${receivedBytes} bytes; expected ${installer.sizeBytes}.`);
  }
  if (actualHash !== installer.sha256) {
    rmSync(temporaryPath, { force: true });
    throw new Error(`Ollama download SHA-256 mismatch (${actualHash}).`);
  }

  return temporaryPath;
}

const existing = await validateInstaller(installerPath);
if (existing.valid) {
  console.log(`Verified existing ${installer.fileName}: ${existing.sha256}`);
  process.exit(0);
}

if (verifyOnly) {
  throw new Error(`Ollama installer verification failed: ${existing.reason}. Run without --verify to fetch the pinned installer.`);
}

if (existsSync(installerPath)) {
  console.warn(`Removing invalid ${installer.fileName} before downloading a verified replacement: ${existing.reason}`);
  rmSync(installerPath, { force: true });
}

const temporaryPath = await downloadInstaller();
try {
  mkdirSync(dirname(installerPath), { recursive: true });
  renameSync(temporaryPath, installerPath);
} finally {
  rmSync(temporaryPath, { force: true });
}

const final = await validateInstaller(installerPath);
if (!final.valid) {
  throw new Error(`The downloaded Ollama installer did not pass final verification: ${final.reason}`);
}

console.log(`Verified and staged ${installer.fileName} for the Windows Tauri resource bundle: ${final.sha256}`);
