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

// Hover parameters (mouse follow - always active)
const MAX_HOVER_ROTATION = Math.PI / 12 // 15 degrees
const HOVER_LERP = 0.05 // Smooth interpolation speed

// Drag physics parameters
const SENSITIVITY = 0.008 // Rotation per pixel of drag
const FRICTION = 0.95 // Velocity decay per frame
const MIN_VELOCITY = 0.0001 // Stop threshold
const RESET_SPEED = 0.08 // Lerp factor for double-click reset

// Hover state (layer 1: always active)
let hoverTargetX = 0
let hoverTargetY = 0
let hoverCurrentX = 0
let hoverCurrentY = 0

// Drag state (layer 2: additive offset from dragging)
let isDragging = false
let lastPointerX = 0
let lastPointerY = 0
let lastMoveTime = 0
let dragOffsetX = 0 // Extra rotation from dragging
let dragOffsetY = 0
let dragVelocityX = 0 // Angular velocity for inertia
let dragVelocityY = 0
let isResetting = false // Double-click smooth reset in progress

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
    // Layer 1: Hover (always active, smooth follow mouse)
    hoverCurrentX += (hoverTargetX - hoverCurrentX) * HOVER_LERP
    hoverCurrentY += (hoverTargetY - hoverCurrentY) * HOVER_LERP

    // Layer 2: Drag offset
    if (!isDragging) {
      if (isResetting) {
        // Smooth lerp back to zero on double-click
        dragOffsetX += -dragOffsetX * RESET_SPEED
        dragOffsetY += -dragOffsetY * RESET_SPEED

        if (Math.abs(dragOffsetX) < 0.005 && Math.abs(dragOffsetY) < 0.005) {
          dragOffsetX = 0
          dragOffsetY = 0
          isResetting = false
        }
      } else {
        // Normal inertia
        dragVelocityX *= FRICTION
        dragVelocityY *= FRICTION
        if (Math.abs(dragVelocityX) < MIN_VELOCITY) dragVelocityX = 0
        if (Math.abs(dragVelocityY) < MIN_VELOCITY) dragVelocityY = 0

        dragOffsetX += dragVelocityX
        dragOffsetY += dragVelocityY
      }
    }

    // Final rotation = base + hover + drag
    banana.rotation.x = BASE_ROTATION_X + hoverCurrentX + dragOffsetX
    banana.rotation.y = BASE_ROTATION_Y + hoverCurrentY + dragOffsetY
  }

  renderer.render(scene, camera)
}

// Hover handler (mouse follow - works on whole window)
function onMouseMove(event) {
  const mouseX = (event.clientX / window.innerWidth) * 2 - 1
  const mouseY = (event.clientY / window.innerHeight) * 2 - 1

  hoverTargetY = mouseX * MAX_HOVER_ROTATION
  hoverTargetX = -mouseY * MAX_HOVER_ROTATION
}

// Pointer event handlers (unified for mouse & touch)
function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()

  isDragging = true
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  lastMoveTime = performance.now()

  // Stop inertia and reset animation on new drag
  dragVelocityX = 0
  dragVelocityY = 0
  isResetting = false

  containerRef.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event) {
  if (!isDragging) return
  event.preventDefault()

  const currentTime = performance.now()
  const deltaTime = currentTime - lastMoveTime
  const deltaX = event.clientX - lastPointerX
  const deltaY = event.clientY - lastPointerY

  // Update drag offset
  dragOffsetY += deltaX * SENSITIVITY
  dragOffsetX += -deltaY * SENSITIVITY

  // Calculate velocity for inertia
  if (deltaTime > 0) {
    const instantVX = (-deltaY * SENSITIVITY) / deltaTime * 16
    const instantVY = (deltaX * SENSITIVITY) / deltaTime * 16
    dragVelocityX = instantVX * 0.5 + dragVelocityX * 0.5
    dragVelocityY = instantVY * 0.5 + dragVelocityY * 0.5
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

  // Start smooth reset to original position
  dragVelocityX = 0
  dragVelocityY = 0
  isResetting = true
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

  // Hover: mouse follow on whole window
  window.addEventListener('mousemove', onMouseMove)

  // Drag: pointer events on container
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

  window.removeEventListener('mousemove', onMouseMove)
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
