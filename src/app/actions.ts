/**
 * 액션 레지스트리 — 사람이 쓸 수 있는 모든 기능의 목록. SSOT.
 *
 * 툴바 · 우클릭 메뉴 · 버블 툴바 · 단축키 · 명령 목록(Ctrl+K)이 전부 이 배열에서 파생된다.
 * 그래서 "코드에는 있는데 화면 어디에도 없는 기능"이 생길 수 없다.
 *
 * 새 커맨드를 core/commands.ts 에 추가하면 여기에도 반드시 등록한다.
 * covers 에 커맨드 타입을 적어 두면 세션 훅의 정적 점검이 누락을 잡아낸다.
 *
 * 단축키는 한국에서 쓰는 오피스 도구의 관습을 그대로 따른다. 새로 배우게 하지 않는다.
 */
import { BODY_ROLES } from '@contract/index';
import type { Command } from '@core/index';
import type { EditorApi } from './editor';

export type Surface = 'toolbar' | 'context' | 'bubble' | 'palette';

export type ActionGroup =
  | '프로젝트' | '파일' | '슬라이드' | '편집' | '삽입' | '글자' | '서식' | '배치' | '정렬' | '순서'
  | '보기' | '선택' | '검사' | '위계';

export interface ActionCtx {
  api: EditorApi;
  /** 현재 선택 개수 */
  count: number;
  /** 선택에 떼어낸 요소가 있는가 */
  hasDetached: boolean;
  /** 선택이 전부 잠겨 있는가 */
  allLocked: boolean;
  /** 선택이 그룹에 속해 있는가 */
  inGroup: boolean;
  hasClipboardNodes: boolean;
  hasClipboardFormat: boolean;
  removedCount: number;
  /** 프로젝트의 장표 수와 지금 장표의 자리(1부터) */
  slideCount: number;
  slideNumber: number;
  /**
   * 우클릭한 장표. 목록에서 다른 장표를 우클릭했을 때, 열려 있는 장표가 아니라
   * 그 장표를 대상으로 삼기 위한 것. 없으면 열려 있는 장표를 쓴다.
   */
  contextSlideId?: string;
}

export interface ActionDef {
  id: string;
  label: string;
  group: ActionGroup;
  /** 'Ctrl+Shift+C' 형식. 대소문자 무시. */
  shortcut?: string;
  hint?: string;
  surfaces: Surface[];
  enabled?(ctx: ActionCtx): boolean;
  danger?: boolean;
  run(ctx: ActionCtx): void;
  /** 이 액션이 발행하는 커맨드 타입. UI 노출 누락 점검에 쓰인다. */
  covers?: Command['type'][];
}

const hasSelection = (c: ActionCtx) => c.count > 0 && !c.allLocked;
const hasMulti = (c: ActionCtx) => c.count > 1 && !c.allLocked;

/** 우클릭한 장표가 있으면 그것이 대상이다. 없으면 열려 있는 장표. */
const targetSlide = (c: ActionCtx) => c.contextSlideId ?? c.api.currentSlideId();
/** 대상 장표의 자리(1부터). 곧 꼬리말 쪽번호다. */
const slideAt = (c: ActionCtx) =>
  c.api.deck.get().slides.findIndex((s) => s.id === targetSlide(c)) + 1;

export const ACTIONS: ActionDef[] = [
  /* ---------------- 프로젝트 (여는 길은 하나) ---------------- */
  // 지난번 폴더가 남아 있으면 그것을 잇고, 없을 때만 고르게 한다.
  // 여는 단추를 둘로 갈라 두면 어느 것을 눌러야 할지 알 수 없다.
  { id: 'deck.openFolder', label: '프로젝트 열기', group: '프로젝트', surfaces: ['toolbar', 'palette'],
    hint: '.kgproj 가 들어 있는 폴더를 엽니다. 지난번 폴더가 있으면 그것부터 잇습니다',
    run: ({ api }) => void api.openFolder() },
  { id: 'deck.diagnoseFolder', label: '폴더 쓰기 진단', group: '프로젝트', surfaces: ['toolbar', 'palette'],
    hint: '폴더에 못 쓸 때 어디서 막혔는지 밟아 보고 결과를 복사합니다',
    run: ({ api }) => void api.diagnoseFolder() },

  /* ---------------- 파일 ---------------- */
  { id: 'file.save', label: '저장', group: '파일', shortcut: 'Ctrl+S', surfaces: ['toolbar', 'palette'],
    hint: '아직 폴더를 정하지 않았으면 이번에 고릅니다',
    run: ({ api }) => void api.save() },
  // 명령줄 도구가 폴더에 쓴 결과(적재·적용·미리보기)를 화면으로 가져오는 유일한 통로다.
  // 편집기는 폴더를 감시하지 않으므로 이 단추가 없으면 새로고침하고 폴더를 다시 여는 수밖에 없다.
  { id: 'file.reload', label: '다시 읽기', group: '파일', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => void api.reloadProject(true) },
  { id: 'file.exportHtml', label: 'HTML 내보내기', group: '파일', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => api.exportHtml() },
  { id: 'file.exportJson', label: 'JSON 내보내기', group: '파일', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => api.exportJson() },
  // 덱 전체 내보내기 — 좌측 목록 순서대로 export/ 에 떨어진다(계약 EXPORT_DIR).
  { id: 'file.exportPng', label: 'PNG 내보내기', group: '파일', surfaces: ['toolbar', 'palette'],
    hint: '덱 전체를 순서대로 PNG 로 — export/png/ 에 01_제목.png 로 떨어집니다',
    run: ({ api }) => void api.exportDeck({ png: true }) },
  { id: 'file.exportPdf', label: 'PDF 내보내기', group: '파일', surfaces: ['toolbar', 'palette'],
    hint: '덱 전체를 한 PDF 로 — 글자가 벡터라 확대·검색이 됩니다',
    run: ({ api }) => void api.exportDeck({ pdf: true }) },
  { id: 'file.exportPptx', label: 'PPTX 내보내기', group: '파일', surfaces: ['toolbar', 'palette'],
    hint: '덱 전체를 PPTX 로 — 장당 그림 한 장이라 화면과 똑같습니다(도형 편집은 안 됩니다)',
    run: ({ api }) => void api.exportDeck({ pptx: true }) },
  { id: 'file.exportAll', label: 'PNG + PDF + PPTX', group: '파일', surfaces: ['palette'],
    hint: '셋 다 한 번에 내보냅니다',
    run: ({ api }) => void api.exportDeck({ png: true, pdf: true, pptx: true }) },
  { id: 'file.rename', label: '제목 바꾸기', group: '파일', surfaces: ['palette'], covers: ['setTitle'],
    run: ({ api }) => {
      const next = window.prompt('장표 제목', api.slides.get().title);
      if (next !== null) api.setTitle(next);
    } },

  /* ---------------- 슬라이드 (프로젝트 단위) ---------------- */
  { id: 'deck.new', label: '새 장표', group: '슬라이드', shortcut: 'Ctrl+M', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => void api.newSlide() },
  { id: 'deck.duplicate', label: '장표 복제', group: '슬라이드', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => void api.duplicateSlide() },
  // 요소 삭제는 되돌아가고 이것은 되돌아가지 않는다. 같은 단어를 쓰면 사람이 같은 것으로 배운다.
  { id: 'deck.delete', label: '장표 파일 지우기', group: '슬라이드', danger: true,
    surfaces: ['toolbar', 'context', 'palette'],
    hint: '되돌릴 수 없습니다. 요소 삭제(Delete)와 달리 파일이 사라집니다',
    enabled: (c) => c.slideCount > 1,
    run: ({ api, contextSlideId }) => {
      const id = contextSlideId ?? api.currentSlideId();
      const entry = api.deck.get().slides.find((s) => s.id === id);
      const name = entry?.title || '제목 없음';
      // 되돌릴 수 없는 일에는 제목을 직접 확인시킨다. confirm 은 반사적으로 넘기게 된다.
      if (window.confirm([`${name}`, '',
        '이 장표의 파일을 지웁니다. 되돌리기로 복구되지 않습니다.',
        '요소 삭제(Delete)와 다릅니다 — 그쪽은 Ctrl+Z 로 돌아옵니다.'].join('\n'))) {
        void api.deleteSlides([id]);
      }
    } },
  { id: 'deck.duplicateHere', label: '장표 복제', group: '슬라이드', surfaces: ['context'],
    run: ({ api, contextSlideId }) => void api.duplicateSlide(contextSlideId) },
  { id: 'deck.prev', label: '이전 장표', group: '슬라이드', shortcut: 'Ctrl+PageUp', surfaces: ['palette'],
    enabled: (c) => c.slideNumber > 1, run: ({ api }) => void step(api, -1) },
  { id: 'deck.next', label: '다음 장표', group: '슬라이드', shortcut: 'Ctrl+PageDown', surfaces: ['palette'],
    enabled: (c) => c.slideNumber < c.slideCount, run: ({ api }) => void step(api, 1) },
  { id: 'deck.moveUp', label: '장표 앞으로', group: '슬라이드', shortcut: 'Ctrl+Shift+PageUp',
    hint: '순서가 곧 꼬리말 쪽번호입니다', surfaces: ['context', 'palette'],
    enabled: (c) => slideAt(c) > 1,
    run: (c) => c.api.moveSlide(targetSlide(c), slideAt(c) - 2) },
  { id: 'deck.moveDown', label: '장표 뒤로', group: '슬라이드', shortcut: 'Ctrl+Shift+PageDown',
    hint: '순서가 곧 꼬리말 쪽번호입니다', surfaces: ['context', 'palette'],
    enabled: (c) => slideAt(c) > 0 && slideAt(c) < c.slideCount,
    run: (c) => c.api.moveSlide(targetSlide(c), slideAt(c)) },

  /* ---------------- 편집 ---------------- */
  { id: 'edit.undo', label: '되돌리기', group: '편집', shortcut: 'Ctrl+Z', surfaces: ['toolbar', 'palette'],
    enabled: ({ api }) => api.slides.canUndo(), run: ({ api }) => api.undo() },
  { id: 'edit.redo', label: '다시 실행', group: '편집', shortcut: 'Ctrl+Y', surfaces: ['toolbar', 'palette'],
    enabled: ({ api }) => api.slides.canRedo(), run: ({ api }) => api.redo() },
  { id: 'edit.redoAlt', label: '다시 실행', group: '편집', shortcut: 'Ctrl+Shift+Z', surfaces: [],
    enabled: ({ api }) => api.slides.canRedo(), run: ({ api }) => api.redo() },

  { id: 'edit.cut', label: '잘라내기', group: '편집', shortcut: 'Ctrl+X', surfaces: ['context', 'palette'],
    enabled: hasSelection, run: ({ api }) => api.cutSelected() },
  { id: 'edit.copy', label: '복사', group: '편집', shortcut: 'Ctrl+C', surfaces: ['context', 'palette'],
    enabled: hasSelection, run: ({ api }) => api.copySelected() },
  { id: 'edit.paste', label: '붙여넣기', group: '편집', shortcut: 'Ctrl+V', surfaces: ['context', 'palette'],
    enabled: (c) => c.hasClipboardNodes, run: ({ api }) => api.paste() },
  { id: 'edit.duplicate', label: '복제', group: '편집', shortcut: 'Ctrl+D',
    hint: 'Ctrl 을 누른 채 끌어도 복사됩니다', surfaces: ['toolbar', 'context', 'palette'],
    enabled: hasSelection, covers: ['insert'], run: ({ api }) => { api.duplicate(); } },
  { id: 'edit.remove', label: '삭제', group: '편집', shortcut: 'Delete', danger: true,
    hint: '되돌리기로 복구할 수 있습니다', surfaces: ['toolbar', 'context', 'palette'],
    enabled: hasSelection, covers: ['remove'], run: ({ api }) => api.removeSelected() },
  { id: 'edit.removeAlt', label: '삭제', group: '편집', shortcut: 'Backspace', surfaces: [],
    enabled: hasSelection, run: ({ api }) => api.removeSelected() },
  { id: 'edit.restoreAll', label: '삭제한 요소 모두 복원', group: '편집', surfaces: ['palette'],
    enabled: (c) => c.removedCount > 0, covers: ['restore'],
    run: ({ api }) => api.restore(api.removedList()) },
  { id: 'edit.selectAll', label: '전체 선택', group: '편집', shortcut: 'Ctrl+A', surfaces: ['palette'],
    run: ({ api }) => api.selectAll() },
  { id: 'edit.clearSelection', label: '선택 해제', group: '편집', shortcut: 'Escape', surfaces: ['palette'],
    enabled: (c) => c.count > 0, run: ({ api }) => api.clearSelection() },

  /* ---------------- 삽입 ---------------- */
  { id: 'insert.text', label: '텍스트 상자', group: '삽입', shortcut: 'Ctrl+Shift+T',
    surfaces: ['toolbar', 'context', 'palette'], run: ({ api }) => api.insert('text') },
  { id: 'insert.box', label: '박스', group: '삽입', shortcut: 'Ctrl+Shift+B',
    surfaces: ['toolbar', 'context', 'palette'], run: ({ api }) => api.insert('box') },

  { id: 'select.copyRef', label: '참조 복사', group: '편집', shortcut: 'Ctrl+Shift+R',
    hint: '고른 것을 가리키는 쪽지를 복사합니다. 채팅창에 붙여 넣으면 AI 가 어디를 고칠지 정확히 압니다',
    surfaces: ['bubble', 'context', 'toolbar', 'palette'],
    enabled: (c) => c.count > 0, run: ({ api }) => void api.copyReference() },

  /* ---------------- 글자 ---------------- */
  { id: 'text.edit', label: '글자 편집', group: '글자', shortcut: 'F2',
    hint: '더블클릭해도 열립니다', surfaces: ['context', 'bubble', 'palette'],
    enabled: hasSelection, covers: ['setText'], run: ({ api }) => api.editSelectedText() },

  /* ---------------- 서식 ---------------- */
  { id: 'format.copy', label: '서식 복사', group: '서식', shortcut: 'Ctrl+Shift+C',
    surfaces: ['toolbar', 'context', 'bubble', 'palette'],
    enabled: (c) => c.count === 1, run: ({ api }) => api.copyFormat() },
  { id: 'format.paste', label: '서식 붙여넣기', group: '서식', shortcut: 'Ctrl+Shift+V',
    surfaces: ['toolbar', 'context', 'bubble', 'palette'],
    enabled: (c) => c.hasClipboardFormat && hasSelection(c), covers: ['applyFormat'],
    run: ({ api }) => api.pasteFormat('all') },
  { id: 'format.pasteText', label: '서식 붙여넣기 — 글자만', group: '서식', surfaces: ['context', 'palette'],
    enabled: (c) => c.hasClipboardFormat && hasSelection(c), run: ({ api }) => api.pasteFormat('text') },
  { id: 'format.pasteShape', label: '서식 붙여넣기 — 도형만', group: '서식', surfaces: ['context', 'palette'],
    enabled: (c) => c.hasClipboardFormat && hasSelection(c), run: ({ api }) => api.pasteFormat('shape') },
  { id: 'format.bigger', label: '글자 키움', group: '서식', shortcut: 'Ctrl+Shift+.',
    hint: '선택 요소만 키웁니다. 위계 전역값을 따르지 않게 됩니다', surfaces: ['bubble', 'palette'],
    enabled: hasSelection, covers: ['setStyle'], run: ({ api }) => stepFontSize(api, 1) },
  { id: 'format.smaller', label: '글자 줄임', group: '서식', shortcut: 'Ctrl+Shift+,',
    surfaces: ['bubble', 'palette'], enabled: hasSelection, run: ({ api }) => stepFontSize(api, -1) },
  { id: 'format.insideBigger', label: '박스 안 글자 키우기', group: '서식', shortcut: 'Alt+Shift+.',
    hint: '박스만 선택해도 안쪽 글자가 모두 커집니다. 자식이 크기를 직접 갖고 있으면 부모 설정은 먹지 않습니다',
    surfaces: ['bubble', 'context', 'palette'], enabled: hasSelection,
    run: ({ api }) => api.scaleTextInside(1.1, false) },
  { id: 'format.insideSmaller', label: '박스 안 글자 줄이기', group: '서식', shortcut: 'Alt+Shift+,',
    surfaces: ['bubble', 'context', 'palette'], enabled: hasSelection,
    run: ({ api }) => api.scaleTextInside(0.9, false) },
  { id: 'format.insideBiggerBox', label: '박스와 안쪽 글자 함께 키우기', group: '서식',
    hint: '자동 배치면 먼저 떼어내 박스 높이를 늘립니다', surfaces: ['context', 'palette'],
    enabled: hasSelection, run: ({ api }) => api.scaleTextInside(1.1, true) },
  { id: 'format.clear', label: '서식 초기화', group: '서식', surfaces: ['context', 'bubble', 'palette'],
    hint: '이 요소를 시스템 초기값으로 되돌립니다', enabled: hasSelection, covers: ['clearStyle'],
    run: ({ api }) => api.clearStyleSelected() },
  { id: 'format.roleAuto', label: '위계 자동 판정으로 되돌리기', group: '서식', surfaces: ['context', 'palette'],
    hint: '속성 패널에서 위계를 직접 고를 수도 있습니다', enabled: hasSelection, covers: ['setRole'],
    run: ({ api }) => api.run({ type: 'setRole', ids: api.selection(), role: null }) },
  { id: 'format.hide', label: '숨기기', group: '서식', surfaces: ['context', 'palette'],
    enabled: hasSelection, covers: ['setHidden'],
    run: ({ api }) => api.run({ type: 'setHidden', ids: api.selection(), hidden: true }) },
  { id: 'format.show', label: '숨김 해제', group: '서식', surfaces: ['context', 'palette'],
    enabled: hasSelection, run: ({ api }) => api.run({ type: 'setHidden', ids: api.selection(), hidden: false }) },

  /* ---------------- 배치 ---------------- */
  { id: 'layout.detach', label: '자유 배치', group: '배치',
    hint: '원하는 자리에 고정합니다. 원래 자리는 그대로 비워 두어 주변이 밀리지 않습니다',
    surfaces: ['toolbar', 'context', 'palette'], enabled: hasSelection, covers: ['detach'],
    run: ({ api }) => api.detachSelected() },
  { id: 'layout.reflow', label: '자동 배치', group: '배치',
    hint: 'KG 레이아웃이 위치와 크기를 정하도록 되돌립니다', surfaces: ['toolbar', 'context', 'palette'],
    enabled: (c) => c.hasDetached, covers: ['reflow'], run: ({ api }) => api.reflowSelected() },
  { id: 'layout.group', label: '그룹', group: '배치', shortcut: 'Ctrl+G',
    surfaces: ['toolbar', 'context', 'palette'], enabled: hasMulti, covers: ['group'],
    run: ({ api }) => api.groupSelected() },
  { id: 'layout.ungroup', label: '그룹 해제', group: '배치', shortcut: 'Ctrl+Shift+G',
    surfaces: ['toolbar', 'context', 'palette'], enabled: (c) => c.inGroup, covers: ['ungroup'],
    run: ({ api }) => api.ungroupSelected() },
  { id: 'layout.grow', label: '10% 키우기', group: '배치', shortcut: 'Ctrl+Alt+.',
    hint: '선택 탭에서 고정점을 고를 수 있습니다', surfaces: ['palette'],
    enabled: (c) => c.hasDetached, covers: ['scaleObject'],
    run: ({ api }) => api.scaleSelected(1.1, 'c') },
  { id: 'layout.shrink', label: '10% 줄이기', group: '배치', shortcut: 'Ctrl+Alt+,',
    surfaces: ['palette'], enabled: (c) => c.hasDetached,
    run: ({ api }) => api.scaleSelected(0.9, 'c') },
  { id: 'layout.center', label: '캔버스 가운데로', group: '배치', surfaces: ['context', 'palette'],
    hint: '떼어낸 요소를 장표 한가운데에 놓습니다', enabled: (c) => c.hasDetached, covers: ['setRect'],
    run: ({ api }) => {
      const doc = api.slides.get();
      for (const id of api.selection()) {
        const l = doc.patches[id]?.layout;
        if (l?.mode !== 'detached' || l.w === undefined || l.h === undefined) continue;
        api.run({
          type: 'setRect', id,
          rect: { x: Math.round((doc.canvas.w - l.w) / 2), y: Math.round((doc.canvas.h - l.h) / 2) },
        });
      }
    } },
  { id: 'layout.lock', label: '잠금', group: '배치', surfaces: ['context', 'palette'],
    hint: '이동·삭제를 막습니다', enabled: (c) => c.count > 0, covers: ['setLocked'],
    run: ({ api }) => api.lockSelected(true) },
  { id: 'layout.unlock', label: '잠금 해제', group: '배치', surfaces: ['context', 'palette'],
    enabled: (c) => c.allLocked, run: ({ api }) => api.lockSelected(false) },

  /* 미세 이동 — 화면에 버튼을 두지는 않지만 목록에는 남긴다 */
  ...([
    ['left', '왼쪽', -1, 0], ['right', '오른쪽', 1, 0], ['up', '위', 0, -1], ['down', '아래', 0, 1],
  ] as const).flatMap(([key, ko, dx, dy]) => ([
    {
      id: `move.${key}`, label: `${ko}으로 1px`, group: '배치' as const,
      shortcut: `Arrow${key[0]!.toUpperCase()}${key.slice(1)}`, surfaces: ['palette'] as Surface[],
      enabled: hasSelection, covers: ['nudge'] as Command['type'][],
      run: ({ api }: ActionCtx) => api.nudgeSelected(dx, dy),
    },
    {
      id: `move.${key}.big`, label: `${ko}으로 8px`, group: '배치' as const,
      shortcut: `Shift+Arrow${key[0]!.toUpperCase()}${key.slice(1)}`, surfaces: [] as Surface[],
      enabled: hasSelection,
      run: ({ api }: ActionCtx) => api.nudgeSelected(dx * 8, dy * 8),
    },
  ])),

  /* ---------------- 정렬 ---------------- */
  ...([
    ['left', '왼쪽 맞춤'], ['hcenter', '가로 가운데'], ['right', '오른쪽 맞춤'],
    ['top', '위쪽 맞춤'], ['vcenter', '세로 가운데'], ['bottom', '아래쪽 맞춤'],
  ] as const).map(([edge, label]): ActionDef => ({
    id: `align.${edge}`, label, group: '정렬', surfaces: ['toolbar', 'palette'],
    hint: '떼어낸 요소끼리만 맞춥니다', enabled: hasMulti, covers: ['alignObjects'],
    run: ({ api }) => api.alignSelected(edge),
  })),
  { id: 'align.distH', label: '가로 균등 배분', group: '정렬', surfaces: ['toolbar', 'palette'],
    enabled: (c) => c.count > 2, covers: ['distribute'],
    run: ({ api }) => api.distributeSelected('horizontal') },
  { id: 'align.distV', label: '세로 균등 배분', group: '정렬', surfaces: ['toolbar', 'palette'],
    enabled: (c) => c.count > 2, run: ({ api }) => api.distributeSelected('vertical') },

  /* ---------------- 순서 ---------------- */
  ...([
    ['front', '맨 앞으로', 'Ctrl+Shift+]'], ['forward', '앞으로', 'Ctrl+]'],
    ['backward', '뒤로', 'Ctrl+['], ['back', '맨 뒤로', 'Ctrl+Shift+['],
  ] as const).map(([op, label, shortcut]): ActionDef => ({
    id: `order.${op}`, label, group: '순서', shortcut,
    surfaces: ['toolbar', 'context', 'palette'], enabled: (c) => c.hasDetached, covers: ['order'],
    run: ({ api }) => api.orderSelected(op),
  })),

  /* ---------------- 보기 ---------------- */
  { id: 'view.fit', label: '화면 맞춤', group: '보기', shortcut: 'Ctrl+0', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => api.setZoom('fit') },
  { id: 'view.actual', label: '실제 크기', group: '보기', shortcut: 'Ctrl+1', surfaces: ['toolbar', 'palette'],
    run: ({ api }) => api.setZoom(1) },
  { id: 'view.zoomIn', label: '확대', group: '보기', shortcut: 'Ctrl+=', surfaces: ['palette'],
    run: ({ api }) => api.setZoom(clampZoom(currentZoom(api) * 1.15)) },
  { id: 'view.zoomOut', label: '축소', group: '보기', shortcut: 'Ctrl+-', surfaces: ['palette'],
    run: ({ api }) => api.setZoom(clampZoom(currentZoom(api) / 1.15)) },

  /* ---------------- 선택 ---------------- */
  { id: 'marquee.cross', label: '교차 선택', group: '선택',
    hint: '빈 곳을 끌면 조금이라도 걸친 개체가 모두 선택됩니다 (파워포인트 방식)',
    surfaces: ['toolbar', 'palette'],
    run: ({ api }) => api.setMarqueeMode('cross') },
  { id: 'marquee.contain', label: '포함 선택', group: '선택',
    hint: '빈 곳을 끌면 상자가 통째로 들어온 개체만 선택됩니다 (포토샵 방식)',
    surfaces: ['toolbar', 'palette'],
    run: ({ api }) => api.setMarqueeMode('contain') },

  /* ---------------- 검사 ---------------- */
  { id: 'audit.fixAll', label: '넘침 일괄 보정', group: '검사', surfaces: ['toolbar', 'palette'],
    hint: '글자 크기를 줄여 박스 안에 맞춥니다. 프로젝트 하한 아래로는 줄이지 않습니다',
    run: ({ api }) => api.fixOverflow() },
  { id: 'audit.fixSelected', label: '선택 요소 넘침 보정', group: '검사', surfaces: ['context', 'palette'],
    enabled: hasSelection, run: ({ api }) => api.fixOverflow(api.selection()) },
  { id: 'audit.raiseMin', label: '작은 글자를 프로젝트 하한까지 키우기', group: '검사',
    hint: 'kg.config.json 의 minFontSize 기준', surfaces: ['palette'],
    run: ({ api }) => {
      const floor = api.settings().minFontSize;
      const small = api.audit().filter((i) => i.kind === 'tooSmall');
      if (small.length) api.runAll(small.map((i) => ({
        type: 'setStyle', ids: [i.id], style: { fontSize: floor },
      })));
    } },

  /* ---------------- 블라인드 ----------------
   * 검사에 둔다. "잘 보이는가" 가 아니라 "내보내도 되는가" 를 확인하는 일이고,
   * 넘침 검사와 마찬가지로 내기 전에 한 번 훑는 성격이기 때문이다.
   */
  { id: 'blind.paint', label: '형광펜', group: '검사', shortcut: 'Ctrl+Shift+H',
    surfaces: ['toolbar', 'palette'],
    hint: '끌어서 가릴 자리를 칠합니다. 칠해진 자리에서 끌면 지웁니다',
    run: ({ api }) => api.setBlindPaint(!api.blindPaint()) },
  { id: 'blind.mark', label: '고른 것 가리기', group: '검사', surfaces: ['context', 'palette'],
    hint: '사본으로 낼 때 *****로 덮입니다', covers: ['setBlind'],
    // 잠긴 것도 가릴 수 있다. 머리말·꼬리말의 사명과 발주처 이름이 거기 있다.
    enabled: (c) => c.count > 0,
    run: ({ api }) => api.blindSelected(true) },
  { id: 'blind.unmark', label: '고른 것 가리기 풀기', group: '검사', surfaces: ['context', 'palette'],
    enabled: (c) => c.count > 0,
    run: ({ api }) => api.blindSelected(false) },
  { id: 'blind.clear', label: '이 장표 가리기 전체 풀기', group: '검사', surfaces: ['palette'],
    danger: true, covers: ['clearBlind'],
    run: ({ api }) => api.clearBlind() },
  { id: 'blind.copyMode', label: '사본 모드 켜고 끄기', group: '검사', surfaces: ['toolbar', 'palette'],
    hint: '사본으로 내보내면 칠한 자리·사명·로고가 *****로 덮입니다',
    run: ({ api }) => api.setCopyMode(!api.copyMode()) },

  /* ---------------- 위계 ---------------- */
  { id: 'theme.reset', label: '위계 전역값 초기화', group: '위계', surfaces: ['palette'],
    hint: '개별 오버라이드는 그대로 두고 전역 조정만 되돌립니다', covers: ['resetTheme'],
    run: ({ api }) => api.resetTheme() },
  { id: 'theme.resetBody', label: '본문 위계 전체 초기화', group: '위계', surfaces: ['palette'],
    hint: '본문 1~4단의 전역 조정만 되돌립니다', covers: ['setRoleStyle'],
    run: ({ api }) => BODY_ROLES.forEach((r) => api.setRoleStyle(r, null)) },
  { id: 'theme.scaleUp', label: '전체 글자 키움', group: '위계', surfaces: ['palette'], covers: ['setThemeScale'],
    run: ({ api }) => api.setThemeScale(round(Math.min(1.6, api.slides.get().theme.scale + 0.05))) },
  { id: 'theme.scaleDown', label: '전체 글자 줄임', group: '위계', surfaces: ['palette'],
    run: ({ api }) => api.setThemeScale(round(Math.max(0.6, api.slides.get().theme.scale - 0.05))) },
];

/** 커맨드 타입 중 어떤 액션에도 걸리지 않은 것. 세션 훅과 개발 중 점검이 쓴다. */
export const COVERED_COMMANDS: ReadonlySet<Command['type']> = new Set(
  ACTIONS.flatMap((a) => a.covers ?? []),
);

export function byId(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}

export function surface(name: Surface): ActionDef[] {
  return ACTIONS.filter((a) => a.surfaces.includes(name));
}

export function grouped(name: Surface): [ActionGroup, ActionDef[]][] {
  const map = new Map<ActionGroup, ActionDef[]>();
  for (const a of surface(name)) {
    const list = map.get(a.group);
    if (list) list.push(a);
    else map.set(a.group, [a]);
  }
  return [...map.entries()];
}

async function step(api: EditorApi, delta: number): Promise<void> {
  const list = api.deck.get().slides;
  const next = list[api.currentNumber() - 1 + delta];
  if (next) await api.openSlide(next.id);
}

/** 현재 걸린 크기를 읽어 한 단계 올리고 내린다. 값이 없으면 화면에서 재서 시작한다. */
function stepFontSize(api: EditorApi, direction: 1 | -1): void {
  const doc = api.slides.get();
  for (const id of api.selection()) {
    const current = doc.patches[id]?.style?.fontSize ?? measuredFontSize(id);
    if (!current) continue;
    api.run({ type: 'setStyle', ids: [id], style: { fontSize: Math.round(current) + direction } });
  }
}

function measuredFontSize(id: string): number | null {
  const el = document.querySelector(`.ed-paper [data-kg-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const size = parseFloat(getComputedStyle(el).fontSize);
  return Number.isNaN(size) ? null : size;
}

function currentZoom(api: EditorApi): number {
  const z = api.zoom();
  return typeof z === 'number' ? z : 0.6;
}
function clampZoom(z: number): number {
  return Math.round(Math.min(3, Math.max(0.2, z)) * 100) / 100;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
