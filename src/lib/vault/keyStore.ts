/**
 * 「在這台裝置記住」：把解鎖後的金鑰存在 IndexedDB。
 * 金鑰是 non-extractable 的 CryptoKey，存起來也無法被讀出內容，只能在本站拿來加解密。
 * 私密視窗或瀏覽器擋掉儲存時，一律當作沒記住。
 */

const DB_NAME = 'securibit';
const STORE = 'vault-keys';

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> => {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
};

export const loadDeviceKey = (uid: string) => run<CryptoKey>('readonly', (store) => store.get(uid));

export const saveDeviceKey = (uid: string, key: CryptoKey) => run('readwrite', (store) => store.put(key, uid));

export const deleteDeviceKey = (uid: string) => run('readwrite', (store) => store.delete(uid));
