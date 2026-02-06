#!/usr/bin/env node
/**
 * 顏色遷移腳本
 * 將 Tailwind 硬編碼顏色類別替換為語義化 Token
 *
 * 使用方式：
 *   node scripts/migrate-colors.js --dry-run    # 預覽變更（不修改檔案）
 *   node scripts/migrate-colors.js              # 執行遷移
 *   node scripts/migrate-colors.js --verbose    # 顯示詳細資訊
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 遷移映射表
const COLOR_MIGRATION_MAP = {
  // ========================================
  // text-* 類別遷移
  // ========================================

  // 灰階文字
  'text-white': 'text-text-primary',
  'text-gray-300': 'text-text-secondary',
  'text-gray-400': 'text-text-muted',
  'text-gray-500': 'text-text-muted',
  'text-gray-600': 'text-text-muted',
  'text-gray-700': 'text-text-muted',

  // 品牌/連結色
  'text-blue-300': 'text-mode-generate',
  'text-blue-400': 'text-mode-generate',

  // 狀態色
  'text-emerald-300': 'text-status-success',
  'text-emerald-400': 'text-status-success',
  'text-red-300': 'text-status-error',
  'text-red-400': 'text-status-error',
  'text-amber-300': 'text-status-warning',
  'text-amber-400': 'text-status-warning',
  'text-cyan-300': 'text-status-info',
  'text-cyan-400': 'text-status-info',

  // 模式色
  'text-pink-300': 'text-mode-sticker',
  'text-pink-400': 'text-mode-sticker',
  'text-violet-300': 'text-mode-diagram',
  'text-violet-400': 'text-mode-diagram',
  'text-rose-300': 'text-mode-edit',
  'text-rose-400': 'text-mode-edit',

  // ========================================
  // bg-* 類別遷移
  // ========================================

  // 基礎背景
  'bg-white/5': 'bg-bg-muted',
  'bg-white/10': 'bg-bg-interactive',
  'bg-white/20': 'bg-bg-interactive-hover',
  'bg-black/20': 'bg-bg-muted',
  'bg-black/30': 'bg-bg-muted',
  'bg-black/40': 'bg-bg-interactive',

  // 品牌/模式背景
  'bg-blue-500/20': 'bg-mode-generate-muted',
  'bg-blue-500/30': 'bg-mode-generate-muted',
  'bg-blue-500': 'bg-brand-primary',

  // 狀態背景
  'bg-emerald-500/20': 'bg-status-success-muted',
  'bg-emerald-500/30': 'bg-status-success-muted',
  'bg-red-500/20': 'bg-status-error-muted',
  'bg-red-500/30': 'bg-status-error-muted',
  'bg-amber-500/20': 'bg-status-warning-muted',
  'bg-amber-500/30': 'bg-status-warning-muted',
  'bg-cyan-500/20': 'bg-status-info-muted',
  'bg-cyan-500/30': 'bg-status-info-muted',

  // 模式背景
  'bg-pink-500/20': 'bg-mode-sticker-muted',
  'bg-pink-500/30': 'bg-mode-sticker-muted',
  'bg-violet-500/20': 'bg-mode-diagram-muted',
  'bg-violet-500/30': 'bg-mode-diagram-muted',
  'bg-rose-500/20': 'bg-mode-edit-muted',
  'bg-rose-500/30': 'bg-mode-edit-muted',

  // ========================================
  // border-* 類別遷移
  // ========================================

  // 基礎邊框
  'border-white/10': 'border-border-muted',
  'border-white/20': 'border-border-default',
  'border-gray-500': 'border-border-muted',
  'border-gray-700': 'border-border-muted',

  // 品牌/模式邊框
  'border-blue-500': 'border-mode-generate',
  'border-blue-500/50': 'border-mode-generate',

  // 狀態邊框
  'border-emerald-500': 'border-status-success',
  'border-red-500': 'border-status-error',
  'border-amber-500': 'border-status-warning',
  'border-cyan-500': 'border-status-info',
  'border-cyan-400/50': 'border-status-info',

  // 模式邊框
  'border-pink-500': 'border-mode-sticker',
  'border-violet-500': 'border-mode-diagram',
  'border-rose-500': 'border-mode-edit',

  // ========================================
  // hover:* 類別遷移
  // ========================================
  'hover:bg-white/5': 'hover:bg-bg-muted',
  'hover:bg-white/10': 'hover:bg-bg-interactive',
  'hover:bg-white/20': 'hover:bg-bg-interactive-hover',
  'hover:text-white': 'hover:text-text-primary',

  // ========================================
  // focus:* 類別遷移
  // ========================================
  'focus:ring-blue-500': 'focus:ring-brand-primary',
  'focus:border-blue-500': 'focus:border-brand-primary',

  // ========================================
  // 其他常用類別
  // ========================================
  'ring-blue-400': 'ring-brand-primary-light',
  'ring-blue-500': 'ring-brand-primary',
}

// 解析命令列參數
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isVerbose = args.includes('--verbose')

// 統計
let totalFiles = 0
let modifiedFiles = 0
let totalReplacements = 0
const replacementsByFile = {}

/**
 * 遞迴掃描目錄
 */
function scanDirectory(dir, files = []) {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      // 跳過 node_modules 等
      if (!['node_modules', 'dist', '.git'].includes(entry)) {
        scanDirectory(fullPath, files)
      }
    } else if (entry.endsWith('.vue')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * 遷移單一檔案
 */
function migrateFile(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  let newContent = content
  let fileReplacements = 0
  const changes = []

  // 按照舊類別長度排序（長的優先），避免部分匹配問題
  const sortedMappings = Object.entries(COLOR_MIGRATION_MAP).sort(
    (a, b) => b[0].length - a[0].length,
  )

  for (const [oldClass, newClass] of sortedMappings) {
    // 使用 word boundary 確保完整匹配
    // 處理 class 中的特殊字元（如 /）
    const escapedOld = oldClass.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

    // 匹配：在引號、空格或類別分隔符號之間的完整類別名
    const regex = new RegExp(
      `(?<=[\\s"'\`])${escapedOld}(?=[\\s"'\`])`,
      'g',
    )

    const matches = newContent.match(regex)
    if (matches) {
      const count = matches.length
      newContent = newContent.replace(regex, newClass)
      fileReplacements += count
      changes.push({ old: oldClass, new: newClass, count })
    }
  }

  if (fileReplacements > 0) {
    const relativePath = relative(join(__dirname, '..'), filePath)
    replacementsByFile[relativePath] = changes
    totalReplacements += fileReplacements
    modifiedFiles++

    if (!isDryRun) {
      writeFileSync(filePath, newContent)
    }

    if (isVerbose) {
      console.log(`\n📝 ${relativePath}`)
      for (const change of changes) {
        console.log(`   ${change.old} → ${change.new} (${change.count}x)`)
      }
    } else {
      console.log(`${isDryRun ? '[DRY] ' : ''}Migrated: ${relativePath} (${fileReplacements} replacements)`)
    }
  }

  totalFiles++
}

/**
 * 主程式
 */
function main() {
  console.log('🎨 顏色遷移腳本')
  console.log('================')
  console.log(`模式: ${isDryRun ? '預覽 (不修改檔案)' : '執行遷移'}`)
  console.log('')

  const srcDir = join(__dirname, '..', 'src')
  const files = scanDirectory(srcDir)

  console.log(`掃描到 ${files.length} 個 Vue 檔案\n`)

  for (const file of files) {
    migrateFile(file)
  }

  console.log('\n================')
  console.log('📊 遷移統計')
  console.log(`總檔案數: ${totalFiles}`)
  console.log(`修改檔案: ${modifiedFiles}`)
  console.log(`替換次數: ${totalReplacements}`)

  if (isDryRun && totalReplacements > 0) {
    console.log('\n⚠️  這是預覽模式，未實際修改檔案')
    console.log('執行 `node scripts/migrate-colors.js` 來進行實際遷移')
  }

  if (totalReplacements === 0) {
    console.log('\n✅ 沒有需要遷移的顏色類別')
  }
}

main()
