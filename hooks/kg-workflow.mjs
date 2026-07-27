#!/usr/bin/env node
/**
 * 케인즈그룹 장표 워크플로우 주입 훅.
 *
 * 워크플로우를 대화 컨텍스트에 기억시키지 않는다. 파일이 진실이고 훅이 매번 읽어 넣는다.
 * SessionStart 의 matcher 에 compact 가 들어 있어 컨텍스트가 압축된 뒤에도 다시 들어온다.
 *
 * 아무 세션에나 끼어들지 않도록 두 조건 중 하나를 만족할 때만 출력한다.
 *   - 작업 폴더가 02_project 아래일 때
 *   - 사용자가 장표·슬라이드·편집기 관련 이야기를 꺼냈을 때(UserPromptSubmit)
 *
 * 끄려면 ~/.claude/settings.json 에서 이 명령을 지운다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WORKFLOW = join(homedir(), '.claude', 'skills', 'keynes-group-design', 'WORKFLOW.md');
const PROJECT_HINT = /02_project|kg-slide-editor|제안서/i;
const TOPIC = /장표|슬라이드|편집기|워크플로|deck|kgslide|keynes|케인즈|장표화|작도/i;

const raw = readStdin();
let payload = {};
try { payload = raw ? JSON.parse(raw) : {}; } catch { /* 입력이 없어도 동작해야 한다 */ }

const cwd = payload.cwd ?? process.cwd();
const prompt = payload.prompt ?? '';
const relevant = PROJECT_HINT.test(cwd) || TOPIC.test(prompt);

if (relevant && existsSync(WORKFLOW)) {
  process.stdout.write(
    `<kg-workflow source="${WORKFLOW}">\n${readFileSync(WORKFLOW, 'utf8').trim()}\n</kg-workflow>\n`,
  );
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
