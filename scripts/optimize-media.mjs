#!/usr/bin/env node
// Run with Node and the package-lock-pinned sharp dependency installed:
// FFMPEG=/path/to/ffmpeg FFPROBE=/path/to/ffprobe node scripts/optimize-media.mjs
// Originals live outside dist; every run encodes those originals, never a prior result.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalsRoot = path.join(root, 'art/optimization-originals/media');
const manifestPath = path.join(root, 'art/optimized-media/manifest.json');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const imageOptions = {
  qualities: [85, 88, 90, 93],
  effort: 6,
  smartSubsample: true,
  minimumPsnrDb: 37,
  minimumBlockSsim: 0.975,
  preserveDimensions: true,
};
const audioOptions = { codec: 'libmp3lame', bitrate: '128k', compressionLevel: 2 };
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const relative = (absolute) => path.relative(root, absolute).split(path.sep).join('/');

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

async function filesUnder(directory, extension) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(filename, extension));
    else if (entry.isFile() && filename.endsWith(extension)) files.push(filename);
  }
  return files.sort();
}

async function originalFor(releasePath) {
  const originalPath = path.join(originalsRoot, path.relative(path.join(root, 'dist'), releasePath));
  let data;
  try {
    data = await readFile(originalPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = await readFile(releasePath);
    await mkdir(path.dirname(originalPath), { recursive: true });
    // Never overwrite the first source copy, including when two commands overlap.
    try { await writeFile(originalPath, data, { flag: 'wx' }); }
    catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      data = await readFile(originalPath);
    }
  }
  return { originalPath, data };
}

function probeAudio(filename) {
  const metadata = JSON.parse(run(ffprobe, [
    '-v', 'error', '-select_streams', 'a:0', '-show_streams', '-show_format', '-of', 'json', filename,
  ]));
  const stream = metadata.streams[0];
  if (!stream) throw new Error(`No audio stream: ${filename}`);
  return {
    codec: stream.codec_name,
    sampleRateHz: Number(stream.sample_rate),
    channels: stream.channels,
    bitrate: Number(stream.bit_rate),
    containerDurationSeconds: Number(metadata.format.duration),
  };
}

async function decodedAudioSamples(filename, channels) {
  // Count decoded PCM samples so an MP3 delay/padding header cannot conceal truncation.
  const child = spawn(ffmpeg, [
    '-nostdin', '-v', 'error', '-i', filename, '-map', '0:a:0', '-vn', '-f', 's16le', 'pipe:1',
  ]);
  let bytes = 0;
  let stderr = '';
  child.stdout.on('data', (chunk) => { bytes += chunk.length; });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim())));
  });
  const samples = bytes / (channels * 2);
  if (!Number.isInteger(samples)) throw new Error(`Invalid decoded PCM length: ${filename}`);
  return samples;
}

// Mean SSIM over non-overlapping 8x8 blocks and RGB channels, using population
// variance and the standard C1/C2 constants. This is a decoded-image heuristic,
// not perceptual proof of in-game texture quality.
function imageSimilarity(a, b, width, height) {
  let squaredError = 0;
  let absoluteError = 0;
  let ssim = 0;
  let blocks = 0;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let channel = 0; channel < 3; channel++) {
        let sumA = 0, sumB = 0, squareA = 0, squareB = 0, product = 0, count = 0;
        for (let y = by; y < Math.min(by + 8, height); y++) {
          for (let x = bx; x < Math.min(bx + 8, width); x++) {
            const i = (y * width + x) * 3 + channel;
            const va = a[i], vb = b[i], difference = va - vb;
            sumA += va; sumB += vb; squareA += va * va; squareB += vb * vb; product += va * vb;
            squaredError += difference * difference;
            absoluteError += Math.abs(difference);
            count++;
          }
        }
        const meanA = sumA / count, meanB = sumB / count;
        const varianceA = squareA / count - meanA * meanA;
        const varianceB = squareB / count - meanB * meanB;
        const covariance = product / count - meanA * meanB;
        ssim += ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
          ((meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2));
        blocks++;
      }
    }
  }
  return {
    psnrDb: squaredError ? 10 * Math.log10(255 ** 2 / (squaredError / a.length)) : null,
    meanAbsoluteError: absoluteError / a.length,
    blockSsim: ssim / blocks,
  };
}

async function optimizeImage(releasePath) {
  const { originalPath, data } = await originalFor(releasePath);
  const metadata = await sharp(data).metadata();
  if (metadata.hasAlpha) throw new Error(`Alpha image requires a separate preservation policy: ${releasePath}`);
  const originalPixels = await sharp(data).toColourspace('srgb').removeAlpha().raw().toBuffer();
  let output = data;
  let quality = null;
  let similarity = { psnrDb: null, meanAbsoluteError: 0, blockSsim: 1 };
  for (const candidateQuality of imageOptions.qualities) {
    const candidate = await sharp(data).webp({
      quality: candidateQuality, effort: imageOptions.effort, smartSubsample: imageOptions.smartSubsample,
    }).toBuffer();
    if (candidate.length >= data.length) continue;
    const candidatePixels = await sharp(candidate).toColourspace('srgb').removeAlpha().raw().toBuffer();
    const candidateSimilarity = imageSimilarity(originalPixels, candidatePixels, metadata.width, metadata.height);
    if (candidateSimilarity.psnrDb !== null && candidateSimilarity.psnrDb < imageOptions.minimumPsnrDb) continue;
    if (candidateSimilarity.blockSsim < imageOptions.minimumBlockSsim) continue;
    output = candidate;
    quality = candidateQuality;
    similarity = candidateSimilarity;
    break;
  }
  await writeFile(releasePath, output);
  const entry = {
    path: relative(releasePath), originalPath: relative(originalPath),
    originalBytes: data.length, optimizedBytes: output.length, savedBytes: data.length - output.length,
    originalSha256: sha256(data), optimizedSha256: sha256(output),
    width: metadata.width, height: metadata.height, quality,
    decision: quality === null ? 'keep-original' : 'reencode', similarity,
  };
  console.log(`${entry.path}: ${entry.originalBytes} -> ${entry.optimizedBytes} bytes (quality ${quality ?? 'original'})`);
  return entry;
}

async function optimizeAudio(releasePath) {
  const { originalPath, data } = await originalFor(releasePath);
  const original = probeAudio(originalPath);
  original.decodedSamplesPerChannel = await decodedAudioSamples(originalPath, original.channels);
  original.decodedDurationSeconds = original.decodedSamplesPerChannel / original.sampleRateHz;
  // Partial output stays outside dist, including after an interrupted command.
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'obby-media-'));
  const temporaryPath = path.join(temporaryDirectory, 'encoded.mp3');
  let optimized, output;
  try {
    run(ffmpeg, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', originalPath,
      '-map', '0:a:0', '-vn', '-map_metadata', '0', '-c:a', audioOptions.codec,
      '-b:a', audioOptions.bitrate, '-compression_level', String(audioOptions.compressionLevel),
      '-id3v2_version', '3', temporaryPath,
    ]);
    optimized = probeAudio(temporaryPath);
    optimized.decodedSamplesPerChannel = await decodedAudioSamples(temporaryPath, optimized.channels);
    optimized.decodedDurationSeconds = optimized.decodedSamplesPerChannel / optimized.sampleRateHz;
    if (optimized.channels !== original.channels || optimized.sampleRateHz !== original.sampleRateHz ||
        optimized.decodedSamplesPerChannel !== original.decodedSamplesPerChannel) {
      throw new Error(`Audio channel/rate/sample-count preservation failed: ${releasePath}`);
    }
    output = await readFile(temporaryPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  if (output.length >= data.length) throw new Error(`Audio encoding did not reduce size: ${releasePath}`);
  await writeFile(releasePath, output);
  const entry = {
    path: relative(releasePath), originalPath: relative(originalPath),
    originalBytes: data.length, optimizedBytes: output.length, savedBytes: data.length - output.length,
    originalSha256: sha256(data), optimizedSha256: sha256(output), original, optimized,
  };
  console.log(`${entry.path}: ${entry.originalBytes} -> ${entry.optimizedBytes} bytes (${optimized.bitrate} bps)`);
  return entry;
}

function total(entries) {
  const originalBytes = entries.reduce((sum, entry) => sum + entry.originalBytes, 0);
  const optimizedBytes = entries.reduce((sum, entry) => sum + entry.optimizedBytes, 0);
  return { files: entries.length, originalBytes, optimizedBytes, savedBytes: originalBytes - optimizedBytes };
}

async function updateLiveryManifest(images) {
  const filename = path.join(root, 'dist/assets/liveries/manifest.json');
  const { data } = await originalFor(filename);
  const manifest = JSON.parse(data.toString());
  const byPath = new Map(images.map((entry) => [entry.path, entry]));
  for (const file of manifest.files) {
    const entry = byPath.get(`dist/assets/liveries/${file.file}`);
    if (!entry) throw new Error(`Livery metadata has no matching image: ${file.file}`);
    file.bytes = entry.optimizedBytes;
    file.sha256 = entry.optimizedSha256;
  }
  manifest.notes.push('WebP recompressed at unchanged dimensions by scripts/optimize-media.mjs; original files are outside dist.');
  await writeFile(filename, `${JSON.stringify(manifest, null, 2)}\n`);
}

const tools = {
  sharp: sharp.versions,
  ffmpeg: run(ffmpeg, ['-version']).split('\n')[0],
  ffprobe: run(ffprobe, ['-version']).split('\n')[0],
};
const audio = [];
for (const filename of await filesUnder(path.join(root, 'dist/assets/audio/music'), '.mp3')) {
  audio.push(await optimizeAudio(filename));
}
const images = [];
for (const directory of ['dist/assets/liveries', 'dist/assets/shop']) {
  for (const filename of await filesUnder(path.join(root, directory), '.webp')) {
    images.push(await optimizeImage(filename));
  }
}
await updateLiveryManifest(images);
const manifest = {
  schemaVersion: 1,
  tools,
  command: 'FFMPEG=/path/to/ffmpeg FFPROBE=/path/to/ffprobe node scripts/optimize-media.mjs',
  originalsRoot: relative(originalsRoot),
  settings: { audio: audioOptions, images: imageOptions },
  notes: [
    'Existing compressed MP3/WebP files are the preserved input; no source-art PNGs are included in savings.',
    'Audio encoding preserves decoded sample count, channel count, sample rate and track URLs; 128 kbps is lossy and has not been listening-verified.',
    'All image dimensions are unchanged to preserve UV detail; similarity is measured against the decoded previous WebP.',
    'Image similarity thresholds are heuristics, not in-game visual verification; no tests or browser checks are run by this command.',
    'Originals are outside dist and are not part of release assets.',
  ],
  totals: { audio: total(audio), liveries: total(images.filter((entry) => entry.path.includes('/liveries/'))), shop: total(images.filter((entry) => entry.path.includes('/shop/'))), all: total([...audio, ...images]) },
  audio,
  images,
};
await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest.totals, null, 2));
