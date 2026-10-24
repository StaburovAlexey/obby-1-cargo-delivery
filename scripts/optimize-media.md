# Music and WebP optimization

Install the repository's development dependencies, and provide FFmpeg/FFprobe with
the `libmp3lame` encoder. No binary tool is vendored into the game.

```sh
FFMPEG=/path/to/ffmpeg FFPROBE=/path/to/ffprobe node scripts/optimize-media.mjs
```

If the executables are on `PATH`, `node scripts/optimize-media.mjs` is sufficient.
Locally extracted FFmpeg packages may also need an `LD_LIBRARY_PATH` pointing to
their extracted library directory. The recorded run used Ubuntu FFmpeg
`6.1.1-3ubuntu5`, extracted under `/tmp` without a global installation; sharp and
its native codec versions are recorded in the generated manifest.

The command preserves the first input copy under
`art/optimization-originals/media/assets/`, outside the release tree. Later runs
always encode that copy, preventing repeated lossy encoding. These are the
previous MP3/WebP release files, not the larger authored PNG sheets. When artwork
is intentionally replaced, update its stored original deliberately before
regenerating; the command does not overwrite a preserved source automatically.

Music stays MP3 at the existing URLs, encoded at 128 kbps with the original
channel count and sample rate. The command decodes both files and requires the
same number of PCM samples per channel. MP3 container duration can differ by one
padding frame while decoded playback duration stays equal. It does not trim,
normalize or adjust the playback code. Listening quality has not been verified.

WebP images keep their dimensions and use effort 6 with smart subsampling. The
command tries quality 85, 88, 90 and 93, accepting the first smaller file with
RGB PSNR at least 37 dB and mean 8×8 RGB block SSIM at least 0.975 against the
decoded previous WebP. It retains the original if no candidate meets both
conditions. These numerical thresholds help limit additional loss; they do not
replace in-game visual inspection. Alpha images require a separate explicit
policy and stop the command instead of silently dropping transparency.

`art/optimized-media/manifest.json` records settings, tool versions, every
original/output SHA-256 and byte count, image dimensions and similarity, and
audio stream metadata plus decoded duration. The livery release manifest gets
its byte/hash entries refreshed. Existing artwork layout and music catalog URLs
stay the same. No test suites or browser checks are run by this command.

The recorded optimization reduces 52 media files from 29,535,197 to 18,420,891
bytes, saving 11,114,306 bytes. This excludes source-art PNGs and the tiny metadata
manifest itself.
