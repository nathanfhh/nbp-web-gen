/**
 * Composable for toggling items in an array
 * Reduces code duplication across components that need toggle functionality
 */

/**
 * Create toggle function for an array
 * @param {Function} getArray - Function that returns the array to toggle items in
 * @returns {Object} Object containing toggle, add, remove, and has methods
 */
export function useArrayToggle(getArray) {
  /**
   * Toggle an item in the array (add if not present, remove if present)
   * @param {*} item - The item to toggle
   */
  const toggle = (item) => {
    const array = getArray()
    const index = array.indexOf(item)
    if (index === -1) {
      array.push(item)
    } else {
      array.splice(index, 1)
    }
  }

  /**
   * Add an item to the array if not already present
   * @param {*} item - The item to add
   * @returns {boolean} True if item was added, false if already present
   */
  const add = (item) => {
    const array = getArray()
    if (!array.includes(item)) {
      array.push(item)
      return true
    }
    return false
  }

  /**
   * Remove an item from the array
   * @param {*} item - The item to remove
   * @returns {boolean} True if item was removed, false if not found
   */
  const remove = (item) => {
    const array = getArray()
    const index = array.indexOf(item)
    if (index !== -1) {
      array.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Check if an item is in the array
   * @param {*} item - The item to check
   * @returns {boolean} True if item is in array
   */
  const has = (item) => {
    return getArray().includes(item)
  }

  /**
   * Add multiple items from a comma-separated string
   * @param {string} inputValue - Comma-separated string of items
   * @returns {number} Number of items added
   */
  const addFromInput = (inputValue) => {
    const items = inputValue
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s)
    let addedCount = 0
    items.forEach((item) => {
      if (add(item)) addedCount++
    })
    return addedCount
  }

  return {
    toggle,
    add,
    remove,
    has,
    addFromInput,
  }
}

/**
 * Create multiple togglers for different arrays at once
 * @param {Object} arrayGetters - Object mapping names to array getter functions
 * @returns {Object} Object mapping names to toggle objects
 *
 * @example
 * const togglers = useMultiArrayToggle({
 *   styles: () => options.value.styles,
 *   variations: () => options.value.variations,
 * })
 * togglers.styles.toggle('anime')
 * togglers.variations.has('lighting')
 */
export function useMultiArrayToggle(arrayGetters) {
  const result = {}
  for (const [name, getter] of Object.entries(arrayGetters)) {
    result[name] = useArrayToggle(getter)
  }
  return result
}
