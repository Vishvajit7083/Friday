import { openLocalPathInDefaultApp, sendWindowsMediaKey } from '../electron/windowsAutomation.ts';
import { formatBytes, searchIndexedFiles } from '../src/core/fileIndex.ts';
import type { IndexedFileItem, MediaControlAction } from '../src/core/types.ts';
import { getCachedFileIndex } from './fileService.ts';

export interface MediaCommandResult {
  handled: boolean;
  message: string;
  matchedFile?: IndexedFileItem;
  mediaAction?: MediaControlAction;
}

export async function handleMediaVoiceCommand(
  userCommand: string,
  allowedFolders: string[],
  pausedIndexing: boolean
): Promise<MediaCommandResult> {
  const lower = userCommand.toLowerCase();

  // 1. Playback / Volume controls
  if (/\b(increase|raise|turn\s+up)\b.*\b(volume|sound|audio)\b/.test(lower)) {
    const res = await sendWindowsMediaKey('volume_up');
    return {
      handled: true,
      mediaAction: 'volume_up',
      message: res.executed ? 'Increased system volume.' : res.detail,
    };
  }
  if (/\b(decrease|lower|turn\s+down)\b.*\b(volume|sound|audio)\b/.test(lower)) {
    const res = await sendWindowsMediaKey('volume_down');
    return {
      handled: true,
      mediaAction: 'volume_down',
      message: res.executed ? 'Decreased system volume.' : res.detail,
    };
  }
  if (/\b(mute|unmute)\b/.test(lower)) {
    const res = await sendWindowsMediaKey('mute');
    return {
      handled: true,
      mediaAction: 'mute',
      message: res.executed ? 'Toggled system audio mute.' : res.detail,
    };
  }
  if (/\b(next\s+(track|song)|skip\s+song)\b/.test(lower)) {
    const res = await sendWindowsMediaKey('next');
    return {
      handled: true,
      mediaAction: 'next',
      message: res.executed ? 'Skipped to next media track.' : res.detail,
    };
  }
  if (/\b(previous\s+(track|song)|prev\s+song)\b/.test(lower)) {
    const res = await sendWindowsMediaKey('previous');
    return {
      handled: true,
      mediaAction: 'previous',
      message: res.executed ? 'Returned to previous media track.' : res.detail,
    };
  }
  if (/\b(pause|resume)\b/.test(lower) && !/\bplay\b.*\b(music|song|video|downloaded|favourite|favorite)\b/.test(lower)) {
    const res = await sendWindowsMediaKey('play_pause');
    return {
      handled: true,
      mediaAction: 'play_pause',
      message: res.executed ? 'Toggled media playback (Play/Pause).' : res.detail,
    };
  }

  // 2. Local music / video / image lookup & open
  const files = getCachedFileIndex(allowedFolders, pausedIndexing, 300);
  const wantVideo = /\b(video|movie|clip)\b/.test(lower);
  const wantAudio = /\b(music|song|audio|track|listen|favourite|favorite)\b/.test(lower);
  const category = wantVideo ? 'video' : wantAudio ? 'audio' : 'all';

  const matches = searchIndexedFiles(files, userCommand, category);
  if (matches.length === 0) {
    return {
      handled: true,
      message: wantVideo
        ? 'No video files were found in your permitted folders (Downloads, Videos, Desktop, or workspace). Grant access to your Videos or Downloads folder in Settings.'
        : 'No local music or audio files were found in your permitted folders (Music, Downloads, or workspace). Grant access to your Music or Downloads folder in Settings.',
    };
  }

  const top = matches[0];
  const openRes = await openLocalPathInDefaultApp(top.path);
  return {
    handled: true,
    matchedFile: top,
    message: openRes.opened
      ? `Playing "${top.name}" (${formatBytes(top.sizeBytes)}, ${top.relativePath}) using your default Windows player.`
      : `Found "${top.name}" (${formatBytes(top.sizeBytes)} at ${top.relativePath}). ${openRes.detail}`,
  };
}
