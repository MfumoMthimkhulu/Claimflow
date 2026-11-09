// Local prototype storage only. Production needs authenticated, server-owned sessions.
const DATABASE = 'claimflow-evidence-v1';
const STORE = 'vehicle-evidence';

async function evidenceTransaction(mode, action) {
  if (!globalThis.indexedDB) throw new Error('Local evidence storage is unavailable in this browser.');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local evidence storage.'));
    request.onblocked = () => reject(new Error('Close other ClaimFlow tabs and try again.'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Could not save or read evidence. Check browser storage space and try again.'));
    });
  } finally {
    database.close();
  }
}

export const loadEvidence = (customerId, claimId) => evidenceTransaction('readonly', store => store.get(`${customerId}:${claimId}`));
export const saveEvidence = evidence => evidenceTransaction('readwrite', store => store.put({ ...evidence, key: `${evidence.customerId}:${evidence.claimId}` }));
export const deleteEvidence = (customerId, claimId) => evidenceTransaction('readwrite', store => store.delete(`${customerId}:${claimId}`));
