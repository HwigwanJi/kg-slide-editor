/**
 * 파일 왕복 — 내려받기와 읽어들이기.
 *
 * 프로젝트 저장은 project.ts 의 ProjectAdapter 가 맡는다. 여기는 그 바깥으로 한 장씩
 * 꺼내고 넣는 통로만 담당한다(백업·이관·남에게 넘기기).
 */
import { parseSlideDoc, type SlideDoc } from '@contract/index';

export function downloadDoc(doc: SlideDoc): void {
  download(`${slugify(doc.title || doc.id)}.kgslide`, JSON.stringify(doc, null, 2), 'application/json');
}

export function downloadText(filename: string, text: string, mime = 'text/html'): void {
  download(filename, text, mime);
}

export async function readDocFile(file: File): Promise<SlideDoc> {
  return parseSlideDoc(JSON.parse(await file.text()));
}

function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'slide';
}
