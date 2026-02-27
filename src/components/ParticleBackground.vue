<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const canvas = ref(null)
let animationId = null
let particles = []

// Helper to hex to rgb
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 59, g: 130, b: 246 } // Fallback blue
}

// Theme-based colors (Dynamic from CSS variable)
const getParticleColor = () => {
  if (typeof window === 'undefined') return { r: 59, g: 130, b: 246 }
  
  // Read CSS variable from root
  const style = getComputedStyle(document.documentElement)
  const color = style.getPropertyValue('--color-brand-primary').trim()
  
  if (color.startsWith('#')) {
    return hexToRgb(color)
  }
  
  // Handle if variable is missing or rgb() format (simplified fallback)
  const isDark = document.documentElement.getAttribute('data-theme-type') === 'dark'
  return isDark
    ? { r: 59, g: 130, b: 246 }
    : { r: 13, g: 94, b: 175 }
}

const config = {
  particleCount: 80,
  particleSize: 2,
  lineDistance: 150,
  speed: 0.3,
}

class Particle {
  constructor(canvas) {
    this.canvas = canvas
    this.x = Math.random() * canvas.width
    this.y = Math.random() * canvas.height
    this.vx = (Math.random() - 0.5) * config.speed
    this.vy = (Math.random() - 0.5) * config.speed
    this.size = Math.random() * config.particleSize + 1
    this.opacity = Math.random() * 0.5 + 0.2
  }

  update() {
    this.x += this.vx
    this.y += this.vy

    if (this.x < 0 || this.x > this.canvas.width) this.vx *= -1
    if (this.y < 0 || this.y > this.canvas.height) this.vy *= -1
  }

  draw(ctx, color) {
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${this.opacity})`
    ctx.fill()
  }
}

const initParticles = () => {
  if (!canvas.value) return
  particles = []
  for (let i = 0; i < config.particleCount; i++) {
    particles.push(new Particle(canvas.value))
  }
}

const drawLines = (ctx, color) => {
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x
      const dy = particles[i].y - particles[j].y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < config.lineDistance) {
        const opacity = (1 - distance / config.lineDistance) * 0.15
        ctx.beginPath()
        ctx.moveTo(particles[i].x, particles[i].y)
        ctx.lineTo(particles[j].x, particles[j].y)
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity})`
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }
}

const animate = () => {
  if (!canvas.value) return

  const ctx = canvas.value.getContext('2d')
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)

  const color = getParticleColor()
  particles.forEach((particle) => {
    particle.update()
    particle.draw(ctx, color)
  })

  drawLines(ctx, color)
  animationId = requestAnimationFrame(animate)
}

const handleResize = () => {
  if (!canvas.value) return
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight
  initParticles()
}

onMounted(() => {
  handleResize()
  animate()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <canvas ref="canvas" id="particles-canvas"></canvas>
</template>
