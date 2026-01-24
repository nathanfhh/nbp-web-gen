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
let mouseX = 0
let mouseY = 0
const BASE_ROTATION_X = (20 * Math.PI) / 180 // 20 degrees
const BASE_ROTATION_Y = (200 * Math.PI) / 180 // 200 degrees
const MAX_ROTATION = Math.PI / 12 // 15 degrees

let targetRotationX = BASE_ROTATION_X
let targetRotationY = BASE_ROTATION_Y
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
    // Smooth interpolation toward target rotation
    const currentX = banana.rotation.x
    const currentY = banana.rotation.y

    banana.rotation.x += (targetRotationX - currentX) * 0.05
    banana.rotation.y += (targetRotationY - currentY) * 0.05
  }

  renderer.render(scene, camera)
}

function updateRotation(clientX, clientY) {
  // Calculate normalized position (-1 to 1)
  mouseX = (clientX / window.innerWidth) * 2 - 1
  mouseY = (clientY / window.innerHeight) * 2 - 1

  // Update target rotation (based on default + mouse offset)
  targetRotationY = BASE_ROTATION_Y + mouseX * MAX_ROTATION
  targetRotationX = BASE_ROTATION_X + -mouseY * MAX_ROTATION
}

function onMouseMove(event) {
  updateRotation(event.clientX, event.clientY)
}

function onTouchMove(event) {
  if (event.touches.length > 0) {
    updateRotation(event.touches[0].clientX, event.touches[0].clientY)
  }
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

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('touchmove', onTouchMove)
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
