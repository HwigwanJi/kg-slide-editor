/**
 * 폴더 핸들 보관 — 새로고침해도 같은 폴더를 다시 연다.
 *
 * 폴더 핸들은 localStorage 에 넣을 수 없다. 문자열이 아니라 브라우저가 들고 있는 객체라
 * IndexedDB 만 그대로 담아 둔다.
 *
 * 담아 두어도 권한까지 이어지지는 않는다. 새로고침하면 대개 "물어봄" 으로 돌아가는데,
 * 다시 받으려면 사용자가 무언가를 눌러야 한다. 그래서 두 갈래로 나눈다.
 *   이미 허용돼 있으면   말없이 그 폴더로 연다
 *   물어봄 상태면        폴더를 다시 고르게 하지 않고, 한 번 눌러 허용만 받는다
 */
const DB = 'kg-editor';
const STORE = 'handles';
const KEY = 'project-folder';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  // 담아 두지 못해도 이번 작업은 계속돼야 한다. 다음 새로고침에서만 손해다.
  await tx('readwrite', (s) => s.put(handle, KEY)).catch(() => undefined);
}

export async function recallFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await tx<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY))
    .catch(() => undefined);
  return handle ?? null;
}

