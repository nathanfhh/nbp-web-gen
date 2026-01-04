import { ref } from 'vue'

const DB_NAME = 'nanobanana-generator'
const DB_VERSION = 2 // Upgraded for image metadata support
const STORE_SETTINGS = 'settings'
const STORE_HISTORY = 'history'

let db = null

export function useIndexedDB() {
  const isReady = ref(false)
  const error = ref(null)

  const initDB = () => {
    return new Promise((resolve, reject) => {
      if (db) {
        isReady.value = true
        resolve(db)
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        error.value = event.target.error
        reject(event.target.error)
      }

      request.onsuccess = (event) => {
        db = event.target.result
        isReady.value = true
        resolve(db)
      }

      request.onupgradeneeded = (event) => {
        const database = event.target.result
        const oldVersion = event.oldVersion

        // Version 0 -> 1: Initial schema
        if (oldVersion < 1) {
          // Settings store - for user preferences
          if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
            database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
          }

          // History store - for generation records
          if (!database.objectStoreNames.contains(STORE_HISTORY)) {
            const historyStore = database.createObjectStore(STORE_HISTORY, {
              keyPath: 'id',
              autoIncrement: true,
            })
            historyStore.createIndex('timestamp', 'timestamp', { unique: false })
            historyStore.createIndex('mode', 'mode', { unique: false })
          }
        }

        // Version 1 -> 2: Add image metadata support
        // No schema changes needed - images field is added to existing records dynamically
        // Existing records without images field will work fine (images will be undefined)
        if (oldVersion < 2) {
          // Future: Could add an index for hasImages if needed
          // const historyStore = event.target.transaction.objectStore(STORE_HISTORY)
          // historyStore.createIndex('hasImages', 'hasImages', { unique: false })
        }
      }
    })
  }

  // Settings operations
  const saveSetting = async (key, value) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SETTINGS], 'readwrite')
      const store = transaction.objectStore(STORE_SETTINGS)
      // Deep clone to ensure plain objects (Vue reactive objects can't be cloned by IndexedDB)
      const record = JSON.parse(JSON.stringify({ key, value, updatedAt: Date.now() }))
      const request = store.put(record)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  const getSetting = async (key) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SETTINGS], 'readonly')
      const store = transaction.objectStore(STORE_SETTINGS)
      const request = store.get(key)

      request.onsuccess = () => resolve(request.result?.value ?? null)
      request.onerror = () => reject(request.error)
    })
  }

  const getAllSettings = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SETTINGS], 'readonly')
      const store = transaction.objectStore(STORE_SETTINGS)
      const request = store.getAll()

      request.onsuccess = () => {
        const settings = {}
        request.result.forEach((item) => {
          settings[item.key] = item.value
        })
        resolve(settings)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // History operations
  const addHistory = async (record) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      // Deep clone to ensure plain objects (Vue reactive arrays can't be cloned by IndexedDB)
      const historyRecord = JSON.parse(JSON.stringify({
        ...record,
        timestamp: Date.now(),
      }))
      const request = store.add(historyRecord)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const getHistory = async (limit = 50, offset = 0) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const index = store.index('timestamp')
      const request = index.openCursor(null, 'prev')

      const results = []
      let skipped = 0

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor && results.length < limit) {
          if (skipped < offset) {
            skipped++
            cursor.continue()
          } else {
            results.push({ ...cursor.value })
            cursor.continue()
          }
        } else {
          resolve(results)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  const getHistoryById = async (id) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const deleteHistory = async (id) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.delete(id)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  const clearAllHistory = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.clear()

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  const getHistoryCount = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Update a history record's images metadata
   * @param {number} id - History record ID
   * @param {Array} images - Image metadata array
   * @returns {Promise<boolean>}
   */
  const updateHistoryImages = async (id, images) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const record = getRequest.result
        if (record) {
          // Deep clone images to ensure plain objects
          record.images = JSON.parse(JSON.stringify(images))
          const putRequest = store.put(record)
          putRequest.onsuccess = () => resolve(true)
          putRequest.onerror = () => reject(putRequest.error)
        } else {
          reject(new Error(`History record with id ${id} not found`))
        }
      }
      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  /**
   * Get all history record IDs (for cleanup operations)
   * @returns {Promise<Array<number>>}
   */
  const getAllHistoryIds = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.getAllKeys()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    isReady,
    error,
    initDB,
    saveSetting,
    getSetting,
    getAllSettings,
    addHistory,
    getHistory,
    getHistoryById,
    deleteHistory,
    clearAllHistory,
    getHistoryCount,
    updateHistoryImages,
    getAllHistoryIds,
  }
}
