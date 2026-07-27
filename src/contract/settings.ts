/**
 * 프로젝트 설정 — 사람이 손으로 고치는 값들. SSOT.
 *
 * 프로젝트 폴더의 `kg.config.json` 한 파일이다. 없으면 아래 기본값이 쓰인다.
 * 편집기·미리보기·검사 도구가 모두 같은 파일을 읽는다. 코드에 숫자를 박아 두지 않는다.
 *
 * 여기 값이 코드에 박혀 있으면 "글자가 너무 작게 줄어든다" 같은 문제를 고칠 방법이
 * 코드 수정밖에 없다. 판단 기준은 프로젝트마다 다르므로 파일로 뺀다.
 */
import { z } from 'zod';

export const SETTINGS_FILE = 'kg.config.json';

export const zProjectSettings = z.object({
  /**
   * 글자 크기 하한(px). 자동 보정이 이보다 작게 줄이지 않는다.
   * KG 밀도 규칙의 최저 기준선(본문 16px, 각주 14px)을 고려해 정한다.
   */
  minFontSize: z.number().min(8).max(24).default(13),
  /** 본문 계열(body1~body4)의 하한. 보조 라벨보다 높게 잡는다. */
  minBodyFontSize: z.number().min(8).max(32).default(14),
  /**
   * 태그·번호 계열(label, label2, num)의 하한.
   * 배지 안의 번호나 칩은 본문보다 작아도 읽힌다. 같은 잣대를 대면 경고만 늘어난다.
   */
  minLabelFontSize: z.number().min(8).max(24).default(12),

  /**
   * 넘침 판정 허용 오차(px).
   * 줄높이 반올림과 글꼴 힌팅 때문에 1~2px 는 늘 뜬다. 그걸 넘침으로 잡으면
   * 여백이 충분한 박스의 글자까지 줄이게 된다.
   */
  overflowTolerance: z.number().min(0).max(8).default(2),

  /**
   * 빈 박스 판정 — 박스 안에서 내용이 차지하는 세로 비율의 하한.
   * 이보다 헐거우면 "빈 박스"로 보고 검사에서 지적한다.
   */
  minFillRatio: z.number().min(0).max(1).default(0.4),
  /** 이 크기(px²)보다 작은 박스는 빈 박스 판정에서 제외한다. 칩·배지까지 잡으면 시끄럽다. */
  minBoxAreaForFill: z.number().min(0).default(9000),

  /** 자동 보정이 자간을 좁힐 수 있는 한계(em). */
  minLetterSpacing: z.number().min(-0.2).max(0).default(-0.04),
  /** 자동 보정이 행간을 좁힐 수 있는 한계. */
  minLineHeight: z.number().min(0.8).max(2).default(1.25),
}).strict();

export type ProjectSettings = z.infer<typeof zProjectSettings>;

export const DEFAULT_SETTINGS: ProjectSettings = zProjectSettings.parse({});

/** 파일을 읽어 설정으로. 깨졌으면 기본값으로 물러난다 — 설정 때문에 편집기가 멈추면 안 된다. */
export function parseSettings(raw: unknown): { settings: ProjectSettings; issues: string[] } {
  const result = zProjectSettings.safeParse(raw ?? {});
  if (result.success) return { settings: result.data, issues: [] };
  return {
    settings: DEFAULT_SETTINGS,
    issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/** 본문 계열은 하한이 다르다. 위계에 맞는 하한을 돌려준다. */
export function floorFor(settings: ProjectSettings, role: string | null | undefined): number {
  if (role?.startsWith('body')) return settings.minBodyFontSize;
  if (role === 'label' || role === 'label2' || role === 'num') return settings.minLabelFontSize;
  return settings.minFontSize;
}
