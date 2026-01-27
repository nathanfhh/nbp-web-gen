<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { withBase } from 'vitepress'
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Box3,
  Vector3,
  SRGBColorSpace,
  ACESFilmicToneMapping,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const containerRef = ref(null)
const isModelReady = ref(false)

let scene, camera, renderer, banana
const BASE_ROTATION_X = (20 * Math.PI) / 180 // 20 degrees
const BASE_ROTATION_Y = (200 * Math.PI) / 180 // 200 degrees

// Physics parameters
const SENSITIVITY = 0.008 // How much rotation per pixel of drag
const FRICTION = 0.95 // Velocity decay per frame (0.95 = smooth stop)
const MIN_VELOCITY = 0.0001 // Stop threshold
const RETURN_SPEED = 0.03 // How fast to return to original position (lerp factor)
const RETURN_DELAY = 300 // ms to wait before returning to original position

// Drag state
let isDragging = false
let lastPointerX = 0
let lastPointerY = 0
let lastMoveTime = 0

// Physics state
let velocityX = 0 // Angular velocity for X rotation
let velocityY = 0 // Angular velocity for Y rotation
let rotationX = BASE_ROTATION_X
let rotationY = BASE_ROTATION_Y
let idleStartTime = 0 // When the banana became idle
let isReturning = false // Whether we're returning to original position

let animationId = null

function init() {
  if (!containerRef.value) return

  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  // Scene
  scene = new Scene()

  // Camera
  camera = new PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.z = 5

  // Renderer with transparency
  renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 2.1
  container.appendChild(renderer.domElement)

  // Lighting - balanced brightness with good color saturation
  const ambientLight = new AmbientLight(0xffffff, 2.8)
  scene.add(ambientLight)

  const directionalLight = new DirectionalLight(0xffffff, 3.2)
  directionalLight.position.set(5, 5, 5)
  scene.add(directionalLight)

  const backLight = new DirectionalLight(0xffffff, 2.0)
  backLight.position.set(-5, -3, -5)
  scene.add(backLight)

  const fillLight = new DirectionalLight(0xffffff, 1.6)
  fillLight.position.set(0, -5, 3)
  scene.add(fillLight)

  // Load GLB model
  const loader = new GLTFLoader()
  loader.load(
    withBase('/banana.glb'),
    (gltf) => {
      banana = gltf.scene

      // Center and scale the model
      const box = new Box3().setFromObject(banana)
      const center = box.getCenter(new Vector3())
      const size = box.getSize(new Vector3())

      // Center the model
      banana.position.sub(center)

      // Scale to fit nicely in view
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2.5 / maxDim
      banana.scale.setScalar(scale)

      // Set initial rotation
      banana.rotation.x = BASE_ROTATION_X
      banana.rotation.y = BASE_ROTATION_Y

      scene.add(banana)

      // Trigger fade transition
      isModelReady.value = true
    },
    undefined,
    (error) => {
      console.error('Error loading banana model:', error)
    }
  )
}

function animate() {
  animationId = requestAnimationFrame(animate)

  if (banana) {
    // Apply velocity when not dragging
    if (!isDragging) {
      // Apply friction
      velocityX *= FRICTION
      velocityY *= FRICTION

      // Stop if velocity is negligible
      if (Math.abs(velocityX) < MIN_VELOCITY) velocityX = 0
      if (Math.abs(velocityY) < MIN_VELOCITY) velocityY = 0

      // Update rotation from velocity
      rotationX += velocityX
      rotationY += velocityY

      // Check if we should start returning to original position
      const isIdle = velocityX === 0 && velocityY === 0
      const isAtOrigin =
        Math.abs(rotationX - BASE_ROTATION_X) < 0.001 &&
        Math.abs(rotationY - BASE_ROTATION_Y) < 0.001

      if (isIdle && !isAtOrigin) {
        const now = performance.now()

        if (!isReturning) {
          // Start idle timer
          if (idleStartTime === 0) {
            idleStartTime = now
          } else if (now - idleStartTime > RETURN_DELAY) {
            // Delay passed, start returning
            isReturning = true
          }
        }

        if (isReturning) {
          // Smoothly lerp back to original position
          rotationX += (BASE_ROTATION_X - rotationX) * RETURN_SPEED
          rotationY += (BASE_ROTATION_Y - rotationY) * RETURN_SPEED

          // Snap to origin if close enough
          if (
            Math.abs(rotationX - BASE_ROTATION_X) < 0.001 &&
            Math.abs(rotationY - BASE_ROTATION_Y) < 0.001
          ) {
            rotationX = BASE_ROTATION_X
            rotationY = BASE_ROTATION_Y
            isReturning = false
            idleStartTime = 0
          }
        }
      } else if (!isIdle) {
        // Reset idle timer when moving
        idleStartTime = 0
        isReturning = false
      }
    }

    // Apply rotation to banana
    banana.rotation.x = rotationX
    banana.rotation.y = rotationY
  }

  renderer.render(scene, camera)
}

// Pointer event handlers (unified for mouse & touch)
function onPointerDown(event) {
  // Only handle primary pointer (left mouse button or first touch)
  if (event.pointerType === 'mouse' && event.button !== 0) return

  // Prevent double-click/tap delay
  event.preventDefault()

  isDragging = true
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  lastMoveTime = performance.now()

  // Reset velocity and return state on new drag
  velocityX = 0
  velocityY = 0
  idleStartTime = 0
  isReturning = false

  // Capture pointer for smooth dragging outside element
  containerRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event) {
  if (!isDragging) return

  event.preventDefault()

  const currentTime = performance.now()
  const deltaTime = currentTime - lastMoveTime

  // Calculate movement delta
  const deltaX = event.clientX - lastPointerX
  const deltaY = event.clientY - lastPointerY

  // Update rotation directly while dragging
  rotationY += deltaX * SENSITIVITY
  rotationX += -deltaY * SENSITIVITY // Invert Y for natural feel

  // Calculate velocity for inertia (pixels per ms -> radians per frame)
  if (deltaTime > 0) {
    // Smooth velocity calculation with some dampening
    const instantVelocityX = (-deltaY * SENSITIVITY) / deltaTime * 16 // ~16ms per frame
    const instantVelocityY = (deltaX * SENSITIVITY) / deltaTime * 16

    // Blend with previous velocity for smoother inertia
    velocityX = instantVelocityX * 0.5 + velocityX * 0.5
    velocityY = instantVelocityY * 0.5 + velocityY * 0.5
  }

  lastPointerX = event.clientX
  lastPointerY = event.clientY
  lastMoveTime = currentTime
}

function onPointerUp(event) {
  if (!isDragging) return

  isDragging = false

  // Release pointer capture
  containerRef.value?.releasePointerCapture(event.pointerId)
}

function onPointerCancel(event) {
  onPointerUp(event)
}

function onDoubleClick(event) {
  event.preventDefault()
  event.stopPropagation()
}

function onResize() {
  if (!containerRef.value || !camera || !renderer) return

  const container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function disposeObject(obj) {
  if (obj.geometry) obj.geometry.dispose()
  if (obj.material) {
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    materials.forEach((m) => {
      // Dispose textures
      if (m.map) m.map.dispose()
      if (m.normalMap) m.normalMap.dispose()
      if (m.roughnessMap) m.roughnessMap.dispose()
      if (m.metalnessMap) m.metalnessMap.dispose()
      if (m.aoMap) m.aoMap.dispose()
      if (m.emissiveMap) m.emissiveMap.dispose()
      m.dispose()
    })
  }
  if (obj.children) {
    obj.children.forEach(disposeObject)
  }
}

onMounted(() => {
  init()
  animate()

  // Use pointer events for unified mouse/touch handling
  const container = containerRef.value
  if (container) {
    container.addEventListener('pointerdown', onPointerDown, { passive: false })
    container.addEventListener('pointermove', onPointerMove, { passive: false })
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerCancel)
    container.addEventListener('pointerleave', onPointerUp)
    container.addEventListener('dblclick', onDoubleClick)
  }

  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  const container = containerRef.value
  if (container) {
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('pointermove', onPointerMove)
    container.removeEventListener('pointerup', onPointerUp)
    container.removeEventListener('pointercancel', onPointerCancel)
    container.removeEventListener('pointerleave', onPointerUp)
    container.removeEventListener('dblclick', onDoubleClick)
  }

  window.removeEventListener('resize', onResize)

  if (animationId) {
    cancelAnimationFrame(animationId)
  }

  // Dispose Three.js resources
  if (banana) {
    disposeObject(banana)
  }

  if (renderer) {
    renderer.dispose()
    if (containerRef.value && renderer.domElement) {
      containerRef.value.removeChild(renderer.domElement)
    }
  }
})
</script>

<template>
  <div class="hero-container">
    <!-- Static image placeholder -->
    <img
      src="/logo.webp"
      alt="Mediator Logo"
      class="hero-image"
      :class="{ 'fade-out': isModelReady }"
    />
    <!-- 3D canvas -->
    <div
      ref="containerRef"
      class="hero-banana"
      :class="{ 'fade-in': isModelReady }"
    ></div>
  </div>
</template>

<style scoped>
.hero-container {
  position: relative;
  width: 100%;
  height: 320px;
}

.hero-image {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 80%;
  max-height: 80%;
  object-fit: contain;
  opacity: 1;
  transition: opacity 0.6s ease-out;
  z-index: 1;
}

.hero-image.fade-out {
  opacity: 0;
  pointer-events: none;
}

.hero-banana {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.6s ease-in;
  cursor: grab;
  touch-action: none; /* Prevent scroll/zoom on touch devices */
  user-select: none; /* Prevent text selection */
  -webkit-user-select: none;
  -webkit-touch-callout: none; /* Prevent iOS callout */
}

.hero-banana:active {
  cursor: grabbing;
}

.hero-banana.fade-in {
  opacity: 1;
}

@media (min-width: 640px) {
  .hero-container {
    height: 400px;
  }
}

@media (min-width: 960px) {
  .hero-container {
    height: 450px;
  }
}
</style>
