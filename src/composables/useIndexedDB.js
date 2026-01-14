import { ref } from 'vue'
import { generateUUID } from './useUUID'

const DB_NAME = 'nanobanana-generator'
const DB_VERSION = 4
const STORE_HISTORY = 'history'
const STORE_CHARACTERS = 'characters'

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

        // Version 1 -> 2: No schema changes (images field added dynamically to records)

        // Version 2 -> 3: Add UUID support for cross-device sync
        if (oldVersion < 3) {
          const historyStore = event.target.transaction.objectStore(STORE_HISTORY)
          if (!historyStore.indexNames.contains('uuid')) {
            historyStore.createIndex('uuid', 'uuid', { unique: true })
          }
        }

        // Version 3 -> 4: Add characters store for character extraction feature
        if (oldVersion < 4) {
          if (!database.objectStoreNames.contains(STORE_CHARACTERS)) {
            const characterStore = database.createObjectStore(STORE_CHARACTERS, {
              keyPath: 'id',
              autoIncrement: true,
            })
            characterStore.createIndex('name', 'name', { unique: false })
            characterStore.createIndex('createdAt', 'createdAt', { unique: false })
          }
        }
      }
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
        uuid: record.uuid || generateUUID(),
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
   * Update history record with video metadata
   * @param {number} id - History record ID
   * @param {Object} video - Video metadata object
   * @returns {Promise<boolean>}
   */
  const updateHistoryVideo = async (id, video) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const record = getRequest.result
        if (record) {
          // Deep clone video to ensure plain object
          record.video = JSON.parse(JSON.stringify(video))
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

  /**
   * Get all history records (for export, no pagination)
   * @returns {Promise<Array>}
   */
  const getAllHistory = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get history records by specific IDs (for selective export/sync)
   * @param {Array<number>} ids - Array of history record IDs
   * @returns {Promise<Array>}
   */
  const getHistoryByIds = async (ids) => {
    await initDB()
    return new Promise((resolve, _reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const results = []
      let completed = 0

      if (ids.length === 0) {
        resolve([])
        return
      }

      ids.forEach((id) => {
        const request = store.get(id)
        request.onsuccess = () => {
          if (request.result) {
            results.push(request.result)
          }
          completed++
          if (completed === ids.length) {
            // Sort by timestamp descending (newest first)
            results.sort((a, b) => b.timestamp - a.timestamp)
            resolve(results)
          }
        }
        request.onerror = () => {
          completed++
          if (completed === ids.length) {
            results.sort((a, b) => b.timestamp - a.timestamp)
            resolve(results)
          }
        }
      })
    })
  }

  /**
   * Check if a history record with given UUID exists
   * @param {string} uuid
   * @returns {Promise<boolean>}
   */
  const hasHistoryByUUID = async (uuid) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readonly')
      const store = transaction.objectStore(STORE_HISTORY)
      const index = store.index('uuid')
      const request = index.get(uuid)

      request.onsuccess = () => resolve(!!request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Add a history record with existing UUID (for import)
   * @param {Object} record - Record with uuid field
   * @returns {Promise<number>} - New record ID
   */
  const addHistoryWithUUID = async (record) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      // Deep clone and ensure uuid exists
      const historyRecord = JSON.parse(JSON.stringify({
        ...record,
        uuid: record.uuid || generateUUID(),
      }))
      // Remove original id to let autoIncrement generate new one
      delete historyRecord.id
      const request = store.add(historyRecord)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Migrate existing records to add UUID (idempotent, run on init)
   * @returns {Promise<boolean>}
   */
  const migrateAddUUIDs = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HISTORY], 'readwrite')
      const store = transaction.objectStore(STORE_HISTORY)
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          const record = cursor.value
          if (!record.uuid) {
            record.uuid = generateUUID()
            cursor.update(record)
          }
          cursor.continue()
        } else {
          resolve(true)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // ============================================================================
  // Character operations
  // ============================================================================

  /**
   * Add a new character
   * @param {Object} character - Character data
   * @returns {Promise<number>} - New character ID
   */
  const addCharacter = async (character) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readwrite')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const now = Date.now()
      const characterRecord = JSON.parse(JSON.stringify({
        ...character,
        createdAt: now,
        updatedAt: now,
      }))
      const request = store.add(characterRecord)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get characters with pagination
   * @param {number} limit - Max records to return
   * @param {number} offset - Records to skip
   * @returns {Promise<Array>}
   */
  const getCharacters = async (limit = 50, offset = 0) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readonly')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const index = store.index('createdAt')
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

  /**
   * Get all characters (no pagination)
   * @returns {Promise<Array>}
   */
  const getAllCharacters = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readonly')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get a character by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  const getCharacterById = async (id) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readonly')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Update a character
   * @param {number} id - Character ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>}
   */
  const updateCharacter = async (id, updates) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readwrite')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const getRequest = store.get(id)

      getRequest.onsuccess = () => {
        const record = getRequest.result
        if (record) {
          const updatedRecord = JSON.parse(JSON.stringify({
            ...record,
            ...updates,
            updatedAt: Date.now(),
          }))
          const putRequest = store.put(updatedRecord)
          putRequest.onsuccess = () => resolve(true)
          putRequest.onerror = () => reject(putRequest.error)
        } else {
          reject(new Error(`Character with id ${id} not found`))
        }
      }
      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  /**
   * Delete a character
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  const deleteCharacter = async (id) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readwrite')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const request = store.delete(id)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get character count
   * @returns {Promise<number>}
   */
  const getCharacterCount = async () => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readonly')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get character by name (for duplicate check during import)
   * @param {string} name - Character name to search
   * @returns {Promise<Object|null>}
   */
  const getCharacterByName = async (name) => {
    await initDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CHARACTERS], 'readonly')
      const store = transaction.objectStore(STORE_CHARACTERS)
      const index = store.index('name')
      const request = index.get(name)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    isReady,
    error,
    initDB,
    // History operations
    addHistory,
    getHistory,
    getHistoryById,
    getHistoryByIds,
    deleteHistory,
    clearAllHistory,
    getHistoryCount,
    updateHistoryImages,
    updateHistoryVideo,
    getAllHistoryIds,
    getAllHistory,
    hasHistoryByUUID,
    addHistoryWithUUID,
    migrateAddUUIDs,
    // Character operations
    addCharacter,
    getCharacters,
    getAllCharacters,
    getCharacterById,
    getCharacterByName,
    updateCharacter,
    deleteCharacter,
    getCharacterCount,
  }
}
