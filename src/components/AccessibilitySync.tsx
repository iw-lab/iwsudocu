'use client';

import { useEffect } from 'react';
import { useUserStore } from '@/lib/store/userStore';
import { soundManager } from '@/lib/audio/soundManager';

/**
 * Mirrors accessibility preferences onto the document root so plain CSS can
 * react to them (see globals.css). Kept out of the game components so the
 * preference applies everywhere — board, number pad, print sheet.
 */
export function AccessibilitySync() {
  const largeText = useUserStore((s) => s.profile.settings.largeText);

  const soundEnabled = useUserStore((s) => s.profile.settings.soundEnabled);

  useEffect(() => {
    document.documentElement.dataset.largeText = largeText ? 'true' : 'false';
  }, [largeText]);

  // 효과음: 설정 반영 + 첫 입력 언락(모든 화면 공통). e2e 가 파일 준비 상태를 읽을 수 있게 비춘다.
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
    soundManager.bindUnlock();
    (window as unknown as { __kcSfx?: () => unknown }).__kcSfx = () => soundManager.status();
  }, [soundEnabled]);

  return null;
}
