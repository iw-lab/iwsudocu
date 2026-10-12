import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  UserProfile,
  UserStats,
  UserSettings,
  Achievement,
  PowerUp,
  StreakData,
  Difficulty,
  WeeklyMission,
  WeeklyMissionState,
} from '@/types';
import { calculateLevel } from '@/lib/game/leveling';
import { calculateRewards } from '@/lib/game/scoring';
import { updateStreak, getStreakMultiplier, getStreakMilestoneReward } from '@/lib/game/streak';
import {
  getDailyBonus,
  checkDailyBonus,
  getWeekId,
  getWeeklyMissionTemplates,
  kstToday,
  getDailyDealIds,
  dealPrice,
} from '@/lib/game/daily';
import { ALL_ACHIEVEMENTS, checkAchievements } from '@/lib/game/achievements';
import { calculateBrainScore } from '@/lib/game/brainScore';
import { soundManager } from '@/lib/audio/soundManager';
import { music } from '@/lib/audio/music';
import { setHapticEnabled } from '@/lib/utils/haptic';
import { useGameStore } from '@/lib/store/gameStore';
import type { Entitlement } from '@/lib/monetization/bridge';
import toast from 'react-hot-toast';

function buildWeeklyMissions(weekId: string): WeeklyMissionState {
  return {
    weekId,
    missions: getWeeklyMissionTemplates(weekId).map((t) => ({
      id: t.id,
      descriptionKo: t.descriptionKo,
      type: t.type,
      target: t.target,
      progress: 0,
      xpReward: t.xpReward,
      coinReward: t.coinReward,
      claimed: false,
    })),
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_STATS: UserStats = {
  totalGamesPlayed: 0,
  totalGamesWon: 0,
  totalTimePlayed: 0,
  bestTimes: {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
    master: 0,
  },
  perfectGames: 0,
  totalMistakes: 0,
  totalHintsUsed: 0,
  maxCombo: 0,
  maxComboHardPlus: 0,
  dailyChallengesCompleted: 0,
  currentStreak: 0,
  longestStreak: 0,
  puzzlesByDifficulty: {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
    master: 0,
  },
  averageTimes: {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
    master: 0,
  },
  perfectGamesByDifficulty: {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
    master: 0,
  },
  winRate: 0,
  brainScore: 0,
  dailyBonusCompleted: 0,
};

const DEFAULT_SETTINGS: UserSettings = {
  soundEnabled: true,
  musicEnabled: true,
  vibrationEnabled: true,
  autoRemoveNotes: true,
  highlightSameNumbers: true,
  highlightConflicts: true,
  showTimer: true,
  showMistakeCount: true,
  darkMode: false,
  language: 'ko',
  numberFirst: false,
  largeText: false,
};

const DEFAULT_STREAK: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastPlayDate: '',
  streakHistory: [],
  streakFreezeCount: 0,
  isStreakActive: false,
  claimedMilestones: [],
};

function createDefaultPowerUps(): PowerUp[] {
  return [
    {
      id: 'reveal_cell',
      name: 'Reveal Cell',
      nameKo: '셀 공개',
      description: 'Reveals a single cell',
      descriptionKo: '하나의 셀을 공개합니다',
      icon: '🔍',
      cost: 100,
      count: 3,
      maxCount: 10,
      effect: 'reveal_cell',
    },
    {
      id: 'check_board',
      name: 'Check Board',
      nameKo: '보드 검사',
      description: 'Highlights all incorrect cells',
      descriptionKo: '잘못된 셀을 표시합니다',
      icon: '✅',
      cost: 150,
      count: 3,
      maxCount: 10,
      effect: 'check_board',
    },
    {
      id: 'freeze_timer',
      name: 'Freeze Timer',
      nameKo: '타이머 정지',
      description: 'Freezes the timer for 30 seconds',
      descriptionKo: '30초 동안 타이머를 정지합니다',
      icon: '❄️',
      cost: 200,
      count: 2,
      maxCount: 5,
      effect: 'freeze_timer',
    },
    {
      id: 'combo_boost',
      name: 'Combo Boost',
      nameKo: '콤보 부스트',
      description: 'Doubles combo multiplier for 60 seconds',
      descriptionKo: '60초 동안 콤보 배율 2배',
      icon: '🚀',
      cost: 300,
      count: 1,
      maxCount: 3,
      effect: 'combo_boost',
    },
    {
      id: 'streak_freeze',
      name: 'Streak Freeze',
      nameKo: '스트릭 보호',
      description: 'Protects your streak for one day',
      descriptionKo: '하루 동안 스트릭을 보호합니다',
      icon: '🛡️',
      cost: 250,
      count: 1,
      maxCount: 3,
      effect: 'streak_freeze',
    },
    {
      id: 'undo_mistake',
      name: 'Undo Mistake',
      nameKo: '실수 취소',
      description: 'Removes one mistake from your count',
      descriptionKo: '실수 횟수를 하나 줄입니다',
      icon: '⏪',
      cost: 150,
      count: 2,
      maxCount: 5,
      effect: 'undo_mistake',
    },
    {
      id: 'hint_pack',
      name: 'Hint Pack',
      nameKo: '힌트 팩',
      description: 'Adds 2 hints to the current game',
      descriptionKo: '현재 게임에 힌트 2회를 추가합니다',
      icon: '💡',
      cost: 120,
      count: 0,
      maxCount: 5,
      effect: 'hint_pack',
    },
    {
      id: 'revive_ticket',
      name: 'Revive Ticket',
      nameKo: '부활권',
      description: 'Continue after a game over without spending coins',
      descriptionKo: '게임 오버 시 코인 없이 이어서 도전합니다',
      icon: '🎟️',
      cost: 250,
      count: 0,
      maxCount: 3,
      effect: 'revive_ticket',
    },
  ];
}

/**
 * Merge persisted power-up counts onto the current catalog, keyed by id, so
 * items added in a later release show up for existing players (and removed ones
 * disappear) instead of the whole array being replaced by the stale save.
 */
function mergePowerUps(persisted: PowerUp[] | undefined): PowerUp[] {
  const defaults = createDefaultPowerUps();
  if (!Array.isArray(persisted)) return defaults;
  return defaults.map((d) => {
    const prev = persisted.find((p) => p && p.id === d.id);
    return prev ? { ...d, count: Math.min(Math.max(0, prev.count ?? 0), d.maxCount) } : d;
  });
}

function createDefaultAchievements(): Achievement[] {
  return ALL_ACHIEVEMENTS.map((a) => ({
    ...a,
    progress: 0,
    isUnlocked: false,
  }));
}

function createDefaultProfile(): UserProfile {
  return {
    id: `user-${Date.now()}`,
    displayName: 'Player',
    level: 1,
    totalXP: 0,
    coins: 100,
    gems: 0,
    streak: { ...DEFAULT_STREAK },
    stats: { ...DEFAULT_STATS },
    achievements: createDefaultAchievements(),
    unlockedThemes: ['default'],
    activeTheme: 'default',
    powerUps: createDefaultPowerUps(),
    settings: { ...DEFAULT_SETTINGS },
    createdAt: new Date().toISOString(),
    dailyCompletedDates: [],
    lastFreeReviveDate: '',
    entitlements: {},
  };
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface RewardOutcome {
  newlyUnlocked: Achievement[];
  earnedXP: number;
  earnedCoins: number;
  leveledUp: boolean;
  newLevel: number;
  dailyBonusAwarded: { xp: number; coins: number; descriptionKo: string } | null;
}

export interface UserStore {
  profile: UserProfile;

  // XP & coins
  addXP: (amount: number) => void;
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;

  // Streak
  recordStreak: () => void;

  // Weekly missions
  getWeeklyMissions: () => WeeklyMission[];
  claimWeeklyMission: (id: string) => boolean;

  // Game result
  recordGameResult: (result: {
    difficulty: Difficulty;
    timeInSeconds: number;
    mistakes: number;
    hintsUsed: number;
    maxCombo: number;
    totalScore: number;
    isDaily?: boolean;
  }) => RewardOutcome;

  // Settings
  updateSettings: (settings: Partial<UserSettings>) => void;

  // Themes
  unlockTheme: (themeId: string, cost: number) => boolean;
  setActiveTheme: (themeId: string) => void;

  // Power-ups
  usePowerUp: (powerUpId: string) => boolean;
  addPowerUp: (powerUpId: string, count: number) => void;
  purchasePowerUp: (powerUpId: string) => boolean;

  // Free daily continue (stands in for the rewarded-ad continue until an ad
  // unit is configured; with ads available the ad path is offered instead)
  canUseFreeRevive: () => boolean;
  consumeFreeRevive: () => boolean;

  // Purchases
  grantEntitlements: (granted: Entitlement[]) => void;
  hasEntitlement: (e: Entitlement) => boolean;

  // Display name
  setDisplayName: (name: string) => void;

  // Reset
  resetProfile: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      profile: createDefaultProfile(),

      // -------------------------------------------------------------------
      // XP & Coins
      // -------------------------------------------------------------------

      addXP: (amount: number) => {
        set((state) => {
          const newTotalXP = state.profile.totalXP + amount;
          const levelData = calculateLevel(newTotalXP);
          const didLevelUp = levelData.level > state.profile.level;

          if (didLevelUp) {
            soundManager.play('levelUp');
          }

          return {
            profile: {
              ...state.profile,
              totalXP: newTotalXP,
              level: levelData.level,
            },
          };
        });
      },

      addCoins: (amount: number) => {
        set((state) => ({
          profile: {
            ...state.profile,
            coins: state.profile.coins + amount,
          },
        }));
      },

      spendCoins: (amount: number) => {
        const { profile } = get();
        if (profile.coins < amount) return false;

        set((state) => ({
          profile: {
            ...state.profile,
            coins: state.profile.coins - amount,
          },
        }));
        return true;
      },

      // -------------------------------------------------------------------
      // Streak
      // -------------------------------------------------------------------

      recordStreak: () => {
        set((state) => {
          const prev = state.profile.streak;
          const newStreak = updateStreak(prev, kstToday());

          // Streak did not actually advance today (same day re-completion or a
          // rewound clock) → pay no milestone. This closes the duplicate-claim
          // exploit where replaying a puzzle re-awarded the same milestone.
          const advanced = newStreak.lastPlayDate !== prev.lastPlayDate;
          const claimed = newStreak.claimedMilestones ?? [];
          const milestone = advanced ? getStreakMilestoneReward(newStreak.currentStreak) : null;
          const alreadyClaimed = milestone ? claimed.includes(newStreak.currentStreak) : true;

          let bonusXP = 0;
          let bonusCoins = 0;
          let nextClaimed = claimed;

          if (milestone && !alreadyClaimed) {
            bonusXP = milestone.xp;
            bonusCoins = milestone.coins;
            nextClaimed = [...claimed, newStreak.currentStreak];
            soundManager.play('streak');
          }

          const newTotalXP = state.profile.totalXP + bonusXP;
          const levelData = calculateLevel(newTotalXP);

          return {
            profile: {
              ...state.profile,
              streak: { ...newStreak, claimedMilestones: nextClaimed },
              totalXP: newTotalXP,
              coins: state.profile.coins + bonusCoins,
              level: levelData.level,
              stats: {
                ...state.profile.stats,
                currentStreak: newStreak.currentStreak,
                longestStreak: newStreak.longestStreak,
              },
            },
          };
        });
      },

      // -------------------------------------------------------------------
      // Weekly missions
      // -------------------------------------------------------------------

      getWeeklyMissions: () => {
        const weekId = getWeekId(new Date());
        const wm = get().profile.weeklyMissions;
        if (!wm || wm.weekId !== weekId) {
          const fresh = buildWeeklyMissions(weekId);
          set((state) => ({ profile: { ...state.profile, weeklyMissions: fresh } }));
          return fresh.missions;
        }
        return wm.missions;
      },

      claimWeeklyMission: (id: string) => {
        const { profile } = get();
        const wm = profile.weeklyMissions;
        if (!wm) return false;
        const mission = wm.missions.find((m) => m.id === id);
        if (!mission || mission.claimed || mission.progress < mission.target) return false;

        const newTotalXP = profile.totalXP + mission.xpReward;
        const levelData = calculateLevel(newTotalXP);
        set((state) => ({
          profile: {
            ...state.profile,
            totalXP: newTotalXP,
            level: levelData.level,
            coins: state.profile.coins + mission.coinReward,
            weeklyMissions: {
              ...wm,
              missions: wm.missions.map((m) => (m.id === id ? { ...m, claimed: true } : m)),
            },
          },
        }));
        soundManager.play('achievement');
        return true;
      },

      // -------------------------------------------------------------------
      // Record game result
      // -------------------------------------------------------------------

      recordGameResult: (result) => {
        const { profile } = get();

        // 1. Rewards via the shared calculator — the score is clamped to its
        // per-difficulty ceiling so a tampered score can't mint unbounded
        // XP/coins, and the completion modal previews these exact numbers.
        const streakMult = getStreakMultiplier(profile.streak.currentStreak);
        const baseReward = calculateRewards({
          totalScore: result.totalScore,
          difficulty: result.difficulty,
          streakMultiplier: streakMult,
        });
        let earnedXP = baseReward.xp;
        let earnedCoins = baseReward.coins;

        // 2. Update stats
        const stats = { ...profile.stats };
        stats.totalGamesPlayed += 1;
        stats.totalGamesWon += 1;
        stats.totalTimePlayed += result.timeInSeconds;
        stats.totalMistakes += result.mistakes;
        stats.totalHintsUsed += result.hintsUsed;
        stats.maxCombo = Math.max(stats.maxCombo, result.maxCombo);
        const isHardPlusRun = ['hard', 'expert', 'master'].includes(result.difficulty);
        if (isHardPlusRun) {
          stats.maxComboHardPlus = Math.max(stats.maxComboHardPlus ?? 0, result.maxCombo);
        }
        stats.puzzlesByDifficulty = {
          ...stats.puzzlesByDifficulty,
          [result.difficulty]: stats.puzzlesByDifficulty[result.difficulty] + 1,
        };

        // Best time
        const currentBest = stats.bestTimes[result.difficulty];
        if (currentBest === 0 || result.timeInSeconds < currentBest) {
          stats.bestTimes = {
            ...stats.bestTimes,
            [result.difficulty]: result.timeInSeconds,
          };
        }

        // Average time
        const playCount = stats.puzzlesByDifficulty[result.difficulty];
        const prevAvg = stats.averageTimes[result.difficulty];
        const newAvg =
          playCount === 1
            ? result.timeInSeconds
            : Math.round((prevAvg * (playCount - 1) + result.timeInSeconds) / playCount);
        stats.averageTimes = {
          ...stats.averageTimes,
          [result.difficulty]: newAvg,
        };

        // Perfect game
        if (result.mistakes === 0 && result.hintsUsed === 0) {
          stats.perfectGames += 1;
          stats.perfectGamesByDifficulty = {
            ...stats.perfectGamesByDifficulty,
            [result.difficulty]: (stats.perfectGamesByDifficulty[result.difficulty] || 0) + 1,
          };
        }

        // Daily challenge — track completed dates separately so ordinary
        // puzzles never mark the daily as done, and verify + award the bonus
        // objective that the UI actually promises.
        let dailyBonusAwarded: RewardOutcome['dailyBonusAwarded'] = null;
        const today = kstToday();
        const prevDailyDates = profile.dailyCompletedDates ?? [];
        let nextDailyDates = prevDailyDates;

        if (result.isDaily) {
          const firstToday = !prevDailyDates.includes(today);
          if (firstToday) {
            stats.dailyChallengesCompleted += 1;
            nextDailyDates = [...prevDailyDates, today].slice(-400);

            const bonus = getDailyBonus(today);
            if (checkDailyBonus(bonus, result)) {
              stats.dailyBonusCompleted = (stats.dailyBonusCompleted ?? 0) + 1;
              earnedXP += bonus.bonusXP;
              earnedCoins += bonus.bonusCoins;
              dailyBonusAwarded = {
                xp: bonus.bonusXP,
                coins: bonus.bonusCoins,
                descriptionKo: bonus.descriptionKo,
              };
            }
          }
        }

        // Win rate
        stats.winRate =
          stats.totalGamesPlayed > 0
            ? Math.round((stats.totalGamesWon / stats.totalGamesPlayed) * 100)
            : 0;

        // Streak stats
        stats.currentStreak = profile.streak.currentStreak;
        stats.longestStreak = profile.streak.longestStreak;

        // Rolling session log for the weekly report. Capped so localStorage
        // can't grow without bound on a heavy player.
        stats.recentSessions = [
          ...(stats.recentSessions ?? []),
          {
            date: today,
            difficulty: result.difficulty,
            timeInSeconds: result.timeInSeconds,
            mistakes: result.mistakes,
            hintsUsed: result.hintsUsed,
            score: result.totalScore,
          },
        ].slice(-120);

        // 3. Recalculate brain score
        stats.brainScore = calculateBrainScore(stats);

        // 4. Check achievements (pass estimated new level for level-based achievements)
        const prevAchievements = profile.achievements;
        const estimatedLevel = calculateLevel(profile.totalXP + earnedXP).level;
        const updatedAchievements = checkAchievements(stats, prevAchievements, estimatedLevel);

        // 5. Find newly unlocked achievements and award bonuses
        const newlyUnlocked: Achievement[] = [];
        for (const ach of updatedAchievements) {
          if (ach.isUnlocked) {
            const prev = prevAchievements.find((a) => a.id === ach.id);
            if (prev && !prev.isUnlocked) {
              newlyUnlocked.push(ach);
              earnedXP += ach.xpReward;
              earnedCoins += ach.coinReward;
            }
          }
        }

        if (newlyUnlocked.length > 0) {
          soundManager.play('achievement');
        }

        // Weekly mission progress (reset when the ISO week changes).
        const weekId = getWeekId(new Date());
        const wmPrev =
          profile.weeklyMissions && profile.weeklyMissions.weekId === weekId
            ? profile.weeklyMissions
            : buildWeeklyMissions(weekId);
        const isHardPlus = isHardPlusRun;
        const isPerfect = result.mistakes === 0 && result.hintsUsed === 0;
        const countedDaily = result.isDaily && !prevDailyDates.includes(today);
        const updatedMissions = wmPrev.missions.map((m) => {
          if (m.claimed) return m;
          let p = m.progress;
          switch (m.type) {
            case 'win_hard': if (isHardPlus) p += 1; break;
            case 'perfect_games': if (isPerfect) p += 1; break;
            case 'daily_streak': if (countedDaily) p += 1; break;
            case 'combo_reach': p = Math.max(p, result.maxCombo); break;
            case 'total_wins': p += 1; break;
          }
          return { ...m, progress: p };
        });
        const weeklyMissions = { weekId, missions: updatedMissions };

        // Calculate new level
        const newTotalXP = profile.totalXP + earnedXP;
        const levelData = calculateLevel(newTotalXP);
        const didLevelUp = levelData.level > profile.level;

        if (didLevelUp) {
          soundManager.play('levelUp');
        }

        // 6. Commit state
        set({
          profile: {
            ...profile,
            totalXP: newTotalXP,
            level: levelData.level,
            coins: profile.coins + earnedCoins,
            stats,
            achievements: updatedAchievements,
            dailyCompletedDates: nextDailyDates,
            weeklyMissions,
          },
        });

        return {
          newlyUnlocked,
          earnedXP,
          earnedCoins,
          leveledUp: didLevelUp,
          newLevel: levelData.level,
          dailyBonusAwarded,
        };
      },

      // -------------------------------------------------------------------
      // Settings
      // -------------------------------------------------------------------

      updateSettings: (settings: Partial<UserSettings>) => {
        set((state) => {
          const newSettings = { ...state.profile.settings, ...settings };

          // Sync sound setting with sound manager
          if (settings.soundEnabled !== undefined) {
            soundManager.setEnabled(settings.soundEnabled);
          }

          // Sync music setting with BGM manager
          if (settings.musicEnabled !== undefined) {
            music.setEnabled(settings.musicEnabled);
          }

          // Sync vibration setting with haptic module
          if (settings.vibrationEnabled !== undefined) {
            setHapticEnabled(settings.vibrationEnabled);
          }

          return {
            profile: {
              ...state.profile,
              settings: newSettings,
            },
          };
        });
      },

      // -------------------------------------------------------------------
      // Themes
      // -------------------------------------------------------------------

      unlockTheme: (themeId: string, cost: number) => {
        const { profile } = get();
        if (profile.coins < cost) return false;
        if (profile.unlockedThemes.includes(themeId)) return false;

        set((state) => ({
          profile: {
            ...state.profile,
            coins: state.profile.coins - cost,
            unlockedThemes: [...state.profile.unlockedThemes, themeId],
          },
        }));

        soundManager.play('powerup');
        return true;
      },

      setActiveTheme: (themeId: string) => {
        const { profile } = get();
        const owned =
          profile.entitlements?.allThemes === true ||
          profile.unlockedThemes.includes(themeId);
        if (!owned) return;

        set((state) => ({
          profile: {
            ...state.profile,
            activeTheme: themeId,
          },
        }));
      },

      // -------------------------------------------------------------------
      // Power-ups
      // -------------------------------------------------------------------

      usePowerUp: (powerUpId: string) => {
        const { profile } = get();
        const powerUp = profile.powerUps.find((p) => p.id === powerUpId);
        if (!powerUp || powerUp.count <= 0) return false;

        // Only consume the item if it can actually take effect right now —
        // otherwise a mistimed tap burned a paid power-up for nothing.
        const gameStatus = useGameStore.getState().status;
        if (powerUpId === 'revive_ticket') {
          if (gameStatus !== 'failed') return false;
        } else if (powerUpId !== 'streak_freeze' && gameStatus !== 'playing') {
          return false;
        }

        set((state) => ({
          profile: {
            ...state.profile,
            powerUps: state.profile.powerUps.map((p) =>
              p.id === powerUpId ? { ...p, count: p.count - 1 } : p,
            ),
          },
        }));

        // Execute the power-up effect via gameStore
        const gameState = useGameStore.getState();
        switch (powerUpId) {
          case 'reveal_cell':
            gameState.revealCell();
            break;
          case 'check_board':
            gameState.checkBoardErrors();
            break;
          case 'freeze_timer':
            gameState.freezeTimer();
            break;
          case 'combo_boost':
            gameState.activateComboBoost();
            break;
          case 'undo_mistake':
            gameState.undoMistake();
            break;
          case 'hint_pack':
            gameState.grantHints(2);
            break;
          case 'revive_ticket':
            gameState.reviveGame();
            toast('부활권을 사용했습니다!', { icon: '🎟️' });
            break;
          case 'streak_freeze':
            // Actually grant a streak-freeze charge so a missed day (gap of 2)
            // still continues the streak. Previously the item was consumed with
            // no effect — a paid power-up that did nothing.
            set((state) => ({
              profile: {
                ...state.profile,
                streak: {
                  ...state.profile.streak,
                  streakFreezeCount: state.profile.streak.streakFreezeCount + 1,
                },
              },
            }));
            soundManager.play('powerup');
            toast('스트릭 보호가 활성화되었습니다! 하루를 건너뛰어도 연속 기록이 유지됩니다.', { icon: '🛡️' });
            break;
        }

        return true;
      },

      addPowerUp: (powerUpId: string, count: number) => {
        set((state) => ({
          profile: {
            ...state.profile,
            powerUps: state.profile.powerUps.map((p) =>
              p.id === powerUpId
                ? { ...p, count: Math.min(p.count + count, p.maxCount) }
                : p,
            ),
          },
        }));
      },

      purchasePowerUp: (powerUpId: string) => {
        const { profile } = get();
        const powerUp = profile.powerUps.find((p) => p.id === powerUpId);
        if (!powerUp) return false;
        if (powerUp.count >= powerUp.maxCount) return false;

        // Same deterministic rotation the shop UI renders, so the price charged
        // always matches the price shown.
        const dealIds = getDailyDealIds(kstToday(), profile.powerUps.map((p) => p.id));
        const price = dealIds.includes(powerUpId) ? dealPrice(powerUp.cost) : powerUp.cost;
        if (profile.coins < price) return false;

        set((state) => ({
          profile: {
            ...state.profile,
            coins: state.profile.coins - price,
            powerUps: state.profile.powerUps.map((p) =>
              p.id === powerUpId ? { ...p, count: p.count + 1 } : p,
            ),
          },
        }));

        soundManager.play('powerup');
        return true;
      },

      // -------------------------------------------------------------------
      // Free daily continue
      // -------------------------------------------------------------------

      canUseFreeRevive: () => get().profile.lastFreeReviveDate !== kstToday(),

      consumeFreeRevive: () => {
        if (!get().canUseFreeRevive()) return false;
        set((state) => ({
          profile: { ...state.profile, lastFreeReviveDate: kstToday() },
        }));
        return true;
      },

      // -------------------------------------------------------------------
      // Purchases
      // -------------------------------------------------------------------

      grantEntitlements: (granted: Entitlement[]) => {
        if (granted.length === 0) return;
        set((state) => {
          const next = { ...(state.profile.entitlements ?? {}) };
          for (const e of granted) {
            if (e === 'seasonPass') next.seasonPass = getWeekId(new Date());
            else next[e] = true;
          }
          return { profile: { ...state.profile, entitlements: next } };
        });
        soundManager.play('powerup');
      },

      hasEntitlement: (e: Entitlement) => {
        const ent = get().profile.entitlements ?? {};
        if (e === 'seasonPass') return ent.seasonPass === getWeekId(new Date());
        return ent[e] === true;
      },

      // -------------------------------------------------------------------
      // Display name
      // -------------------------------------------------------------------

      setDisplayName: (name: string) => {
        set((state) => ({
          profile: {
            ...state.profile,
            displayName: name,
          },
        }));
      },

      // -------------------------------------------------------------------
      // Reset
      // -------------------------------------------------------------------

      resetProfile: () => {
        set({ profile: createDefaultProfile() });
      },
    }),
    {
      name: 'numero-quest-user',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Backfill fields added after a user's profile was first persisted so
      // older saves don't surface undefined → NaN downstream.
      migrate: (persisted: unknown, version: number) => {
        const p = persisted as { profile?: Partial<UserProfile> } | undefined;
        if (!p || !p.profile) return { profile: createDefaultProfile() };
        const prof = p.profile;
        // v2(2026-10-11): 배경음악이 합성음(기본 꺼짐)에서 파일 루프로 바뀌었다 — 고른 적 없이 꺼져 있던 기본값을 켠다
        if (version < 2 && prof.settings) prof.settings = { ...prof.settings, musicEnabled: true };
        return {
          profile: {
            ...createDefaultProfile(),
            ...prof,
            stats: { ...DEFAULT_STATS, ...(prof.stats ?? {}) },
            settings: { ...DEFAULT_SETTINGS, ...(prof.settings ?? {}) },
            streak: { ...DEFAULT_STREAK, ...(prof.streak ?? {}) },
            powerUps: mergePowerUps(prof.powerUps),
            dailyCompletedDates: prof.dailyCompletedDates ?? [],
          },
        };
      },
      merge: (persisted, current) => {
        const p = persisted as { profile?: Partial<UserProfile> } | undefined;
        if (!p?.profile) return current;
        return {
          ...current,
          profile: {
            ...current.profile,
            ...p.profile,
            stats: { ...DEFAULT_STATS, ...(p.profile.stats ?? {}) },
            settings: { ...DEFAULT_SETTINGS, ...(p.profile.settings ?? {}) },
            streak: { ...DEFAULT_STREAK, ...(p.profile.streak ?? {}) },
            powerUps: mergePowerUps(p.profile.powerUps),
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          soundManager.setEnabled(state.profile.settings.soundEnabled);
          music.setEnabled(state.profile.settings.musicEnabled);
          setHapticEnabled(state.profile.settings.vibrationEnabled);
        }
      },
    },
  ),
);
