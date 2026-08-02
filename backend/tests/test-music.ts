import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import play from 'play-dl';
import ytdl from '@distube/ytdl-core';

async function runBackendMusicTests() {
  console.log('====================================================');
  console.log('       Rage Music Engine — Backend Diagnostic       ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Local yt-dlp.exe Binary Check
  console.log('[TEST 1] Checking yt-dlp.exe local binary path...');
  const rootYtDlp = path.join(process.cwd(), 'yt-dlp.exe');
  const binYtDlp = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
  const ytDlpPath = fs.existsSync(rootYtDlp) ? rootYtDlp : binYtDlp;
  const hasLocalYtDlp = fs.existsSync(ytDlpPath);

  if (hasLocalYtDlp) {
    console.log(`  ✓ Found local yt-dlp binary at: ${ytDlpPath}`);
    passed++;
  } else {
    console.log(`  ✘ Local yt-dlp binary not found in root or bin directory.`);
    failed++;
  }

  // Test 2: Execute yt-dlp --version
  console.log('\n[TEST 2] Testing yt-dlp process execution...');
  if (hasLocalYtDlp) {
    try {
      const version = await new Promise<string>((resolve, reject) => {
        const proc = spawn(ytDlpPath, ['--version']);
        let output = '';
        proc.stdout.on('data', data => (output += data.toString()));
        proc.on('close', code => {
          if (code === 0) resolve(output.trim());
          else reject(new Error(`Exit code ${code}`));
        });
        proc.on('error', reject);
      });
      console.log(`  ✓ yt-dlp executed successfully! Version: ${version}`);
      passed++;
    } catch (err: any) {
      console.log(`  ✘ yt-dlp process execution failed: ${err.message}`);
      failed++;
    }
  } else {
    console.log('  ⚠️ Skipping execution test since binary was not found.');
  }

  // Test 3: Test play-dl YouTube Search
  console.log('\n[TEST 3] Testing play-dl search capability...');
  const testUrl = 'https://www.youtube.com/watch?v=9OF_cF48mjA';
  try {
    const searchRes = await play.search('ravana mavanda', { limit: 1 });
    if (searchRes && searchRes.length > 0) {
      console.log(`  ✓ play-dl search operational! Found track: "${searchRes[0].title}"`);
      passed++;
    } else {
      console.log('  ✘ play-dl search returned empty results.');
      failed++;
    }
  } catch (err: any) {
    console.log(`  ✘ play-dl search error: ${err.message}`);
    failed++;
  }

  // Test 4: Test @distube/ytdl-core Info & Stream Capability
  console.log('\n[TEST 4] Testing @distube/ytdl-core extraction...');
  try {
    const isValid = ytdl.validateURL(testUrl);
    if (isValid) {
      console.log(`  ✓ @distube/ytdl-core validated YouTube URL: ${testUrl}`);
      const info = await ytdl.getBasicInfo(testUrl);
      console.log(`  ✓ @distube/ytdl-core fetched video title: "${info.videoDetails.title}"`);
      passed++;
    } else {
      console.log('  ✘ @distube/ytdl-core URL validation failed.');
      failed++;
    }
  } catch (err: any) {
    console.log(`  ✘ @distube/ytdl-core error: ${err.message}`);
    failed++;
  }

  // Test 5: Test yt-dlp Direct Audio URL Extraction & FFmpeg AudioResource Creation
  console.log('\n[TEST 5] Testing yt-dlp direct audio URL extraction & FFmpeg piping...');
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const { createAudioResource, StreamType } = await import('@discordjs/voice');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync(ytDlpPath, [
      '-g',
      '-f', 'bestaudio',
      '--no-playlist',
      '--js-runtimes', 'node',
      testUrl
    ], { timeout: 12000 });

    const directUrl = stdout.trim().split('\n')[0]?.trim();
    if (directUrl && directUrl.startsWith('http')) {
      console.log(`  ✓ yt-dlp extracted direct audio stream URL: ${directUrl.substring(0, 60)}...`);

      const ffmpegPath = (await import('ffmpeg-static')).default;
      const ffmpegProc = spawn((ffmpegPath as string) || 'ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', directUrl,
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      ]);

      let receivedBytes = 0;
      await new Promise<void>((resolve, reject) => {
        ffmpegProc.stdout.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > 32000) {
            ffmpegProc.kill();
            resolve();
          }
        });
        ffmpegProc.on('error', reject);
        setTimeout(() => {
          if (receivedBytes > 0) resolve();
          else reject(new Error('FFmpeg output timeout'));
        }, 5000);
      });

      console.log(`  ✓ FFmpeg successfully decoded ${receivedBytes} bytes of s16le PCM audio data!`);
      passed++;
    } else {
      console.log('  ✘ yt-dlp direct URL extraction returned empty output.');
      failed++;
    }
  } catch (err: any) {
    console.log(`  ✘ Test 5 failed: ${err.message}`);
    failed++;
  }

  // Test Summary
  console.log('\n====================================================');
  console.log(` DIAGNOSTIC COMPLETE: ${passed} PASSED | ${failed} FAILED `);
  console.log('====================================================\n');
}

runBackendMusicTests().catch(console.error);
