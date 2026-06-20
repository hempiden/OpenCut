import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { 
  Play, 
  Pause, 
  Scissors, 
  Download, 
  Upload, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Film, 
  Trash2, 
  CheckCircle, 
  Clock, 
  Sliders, 
  Type, 
  Maximize, 
  Plus, 
  Sparkles, 
  RotateCcw, 
  Music,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Layers,
  Settings,
  Mic,
  Brain
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: Home })

interface VideoClip {
  id: string
  file: File
  url: string
  name: string
  duration: number
  startTime: number
  endTime: number
  // Visual adjustments
  brightness: number
  contrast: number
  saturate: number
  blur: number
  grayscale: number
  sepia: number
  hueRotate: number
  playbackSpeed: number
  // Green Screen
  chromaKeyEnabled: boolean
  chromaKeyColor: string
  chromaKeyThreshold: number
  // Transitions
  transitionType: 'none' | 'fade' | 'fade-to-black'
  transitionDuration: number
  // AI Transcription results
  transcription?: {
    text: string
    chunks: Array<{
      text: string
      timestamp: [number, number]
    }>
  }
}

interface TextLayer {
  id: string
  text: string
  color: string
  fontSize: number
  x: number // percentage 0-100
  y: number // percentage 0-100
  startTime?: number // timing (seconds) relative to global timeline
  endTime?: number
}

interface ImageLayer {
  id: string
  file: File
  url: string
  name: string
  x: number // percentage 0-100
  y: number // percentage 0-100
  scale: number // percentage size multiplier 5-100
}

// Granular overlap-add pitch shifter to modulate voice timbre while preserving duration
function pitchShiftBuffer(audioBuffer: AudioBuffer, semitones: number, audioCtx: AudioContext): AudioBuffer {
  const pitchRatio = Math.pow(2, semitones / 12)
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  
  if (Math.abs(pitchRatio - 1) < 0.05) return audioBuffer
  
  const inputData = audioBuffer.getChannelData(0)
  const outputLength = Math.floor(inputData.length / pitchRatio)
  const outputBuffer = audioCtx.createBuffer(numChannels, outputLength, sampleRate)
  const outputData = outputBuffer.getChannelData(0)
  
  const grainSize = 2205 // ~50ms grain
  const overlap = 1102   // 50% overlap
  
  for (let i = 0; i < outputData.length; i++) {
    outputData[i] = 0
  }
  
  let outPos = 0
  let inPos = 0
  while (inPos < inputData.length - grainSize && outPos < outputData.length - grainSize) {
    for (let j = 0; j < grainSize; j++) {
      const readPos = Math.floor(inPos + j * pitchRatio)
      if (readPos < inputData.length) {
        // Apply Hanning window
        const windowCoeff = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (grainSize - 1)))
        outputData[outPos + j] += inputData[readPos] * windowCoeff
      }
    }
    outPos += overlap
    inPos += Math.floor(overlap * pitchRatio)
  }
  return outputBuffer
}

// Simple Autocorrelation pitch detector to find voice pitch frequency in Hz
function detectPitch(audioBuffer: AudioBuffer): number {
  const signal = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  
  let maxCorrelation = -1
  let bestLag = -1
  
  // Fundamental voice range search: 70Hz (low male) to 400Hz (high female)
  const minLag = Math.floor(sampleRate / 400)
  const maxLag = Math.floor(sampleRate / 70)
  
  for (let lag = minLag; lag < maxLag; lag++) {
    let correlation = 0
    let count = 0
    for (let i = 0; i < signal.length - lag; i += 2) {
      correlation += signal[i] * signal[i + lag]
      count++
    }
    correlation /= count
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation
      bestLag = lag
    }
  }
  
  if (bestLag > 0) {
    return Math.round(sampleRate / bestLag)
  }
  return 150 // fallback (average speech frequency)
}

// In-browser WAV encoder to convert an AudioBuffer to a downloadable file Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // 1 = raw PCM (16-bit)
  const bitDepth = 16
  
  let result: Float32Array
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
  } else {
    result = buffer.getChannelData(0)
  }
  
  const bufferLength = result.length * 2
  const wavBuffer = new ArrayBuffer(44 + bufferLength)
  const view = new DataView(wavBuffer)
  
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + bufferLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numOfChan, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true)
  view.setUint16(32, numOfChan * (bitDepth / 8), true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, bufferLength, true)
  
  floatTo16BitPCM(view, 44, result)
  return new Blob([view], { type: 'audio/wav' })
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length
  const result = new Float32Array(length)
  let index = 0
  let inputIndex = 0
  while (index < length) {
    result[index++] = inputL[inputIndex]
    result[index++] = inputR[inputIndex]
    inputIndex++
  }
  return result
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

function Home() {
  // Monorepo Workspace States
  const [clips, setClips] = useState<VideoClip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'clips' | 'ratio' | 'filters' | 'text' | 'stickers' | 'ai'>('clips')

  // AI Transcription States
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState(0)
  const [transcriptionStatusText, setTranscriptionStatusText] = useState('')

  // Voice recording / pitch analyzer cloning states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceSignatureBuffer, setVoiceSignatureBuffer] = useState<AudioBuffer | null>(null)
  const [userVoicePitch, setUserVoicePitch] = useState<number | null>(null)
  const mediaRecorderVoiceRef = useRef<MediaRecorder | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])

  // TTS Generator States
  const [ttsText, setTtsText] = useState('Hello, this is my cloned voiceover!')
  const [selectedBaseVoice, setSelectedBaseVoice] = useState('Brian')
  const [isGeneratingTts, setIsGeneratingTts] = useState(false)

  // AI Puppeteer States
  const [isWebcamActive, setIsWebcamActive] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState<'robot' | 'kitty' | 'demon'>('robot')
  const [isRecordingAvatar, setIsRecordingAvatar] = useState(false)
  const [avatarRecordingDuration, setAvatarRecordingDuration] = useState(0)

  const webcamVideoRef = useRef<HTMLVideoElement>(null)
  const avatarCanvasRef = useRef<HTMLCanvasElement>(null)
  const faceLandmarkerRef = useRef<any>(null)
  const avatarRecorderRef = useRef<MediaRecorder | null>(null)
  const avatarChunksRef = useRef<Blob[]>([])
  const avatarAnimationRef = useRef<number | null>(null)

  // Global Timeline States
  const [isPlaying, setIsPlaying] = useState(false)
  const [globalTime, setGlobalTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)

  // Aspect Ratio & Canvas Background
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9')
  const [canvasBgColor, setCanvasBgColor] = useState('#090d16')
  const [bgImageUrl, setBgImageUrl] = useState<string>('')

  // Background Music
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [musicUrl, setMusicUrl] = useState<string>('')
  const [musicVolume, setMusicVolume] = useState<number>(0.5)
  const [videoVolume, setVideoVolume] = useState<number>(0.8)

  // Layers
  const [textLayers, setTextLayers] = useState<TextLayer[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)

  // Export State
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportedUrl, setExportedUrl] = useState<string>('')
  const [exportError, setExportError] = useState<string>('')

  // Double Buffering Refs
  const videoRefA = useRef<HTMLVideoElement>(null)
  const videoRefB = useRef<HTMLVideoElement>(null)
  const audioMusicRef = useRef<HTMLAudioElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgImageInputRef = useRef<HTMLInputElement>(null)
  const musicInputRef = useRef<HTMLInputElement>(null)
  const stickerInputRef = useRef<HTMLInputElement>(null)

  const activeVideoSourceRef = useRef<'A' | 'B'>('A')
  const lastTimeRef = useRef<number>(0)
  const requestRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // Audio Context refs to avoid re-connection errors
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioNodesRef = useRef<any>({})

  // Update total duration when clips list or trim values change
  useEffect(() => {
    const total = clips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0)
    setTotalDuration(total)
    if (globalTime > total) {
      setGlobalTime(0)
    }
  }, [clips])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      clips.forEach(c => URL.revokeObjectURL(c.url))
      imageLayers.forEach(i => URL.revokeObjectURL(i.url))
      if (musicUrl) URL.revokeObjectURL(musicUrl)
      if (bgImageUrl) URL.revokeObjectURL(bgImageUrl)
      if (exportedUrl) URL.revokeObjectURL(exportedUrl)
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [])

  // Find active clip index and local time inside it
  const getActiveClipDetails = (time: number) => {
    let accumulatedTime = 0
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const clipPlayDuration = clip.endTime - clip.startTime
      if (time >= accumulatedTime && time <= accumulatedTime + clipPlayDuration) {
        const localTime = clip.startTime + (time - accumulatedTime)
        return { index: i, localTime, accumulatedTime }
      }
      accumulatedTime += clipPlayDuration
    }
    // Fallback if playhead is at the very end
    if (clips.length > 0) {
      const lastIdx = clips.length - 1
      const lastClip = clips[lastIdx]
      return { 
        index: lastIdx, 
        localTime: lastClip.endTime, 
        accumulatedTime: accumulatedTime - (lastClip.endTime - lastClip.startTime) 
      }
    }
    return { index: -1, localTime: 0, accumulatedTime: 0 }
  }

  // Get Aspect Ratio decimal value
  const getAspectMultiplier = (ratio: '16:9' | '9:16' | '1:1') => {
    if (ratio === '9:16') return 9 / 16
    if (ratio === '1:1') return 1
    return 16 / 9
  }

  // Helper to parse hex to RGB
  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.substring(1, 3), 16) || 0
    const g = parseInt(hex.substring(3, 5), 16) || 0
    const b = parseInt(hex.substring(5, 7), 16) || 0
    return { r, g, b }
  }

  // Preview Loop (Composites videos, filters, chroma-key, texts, stickers, backgrounds)
  const runPreviewLoop = () => {
    const canvas = previewCanvasRef.current
    const videoA = videoRefA.current
    const videoB = videoRefB.current
    const music = audioMusicRef.current

    if (!canvas || !videoA || !videoB) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const now = performance.now()
    const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 0
    lastTimeRef.current = now

    // 1. Playhead Advancement
    let nextGlobalTime = globalTime
    if (isPlaying) {
      nextGlobalTime += dt
      if (nextGlobalTime >= totalDuration) {
        nextGlobalTime = 0
        setIsPlaying(false)
        videoA.pause()
        videoB.pause()
        if (music) music.pause()
      }
      setGlobalTime(nextGlobalTime)
    }

    // 2. Playback Synchronization & Double Buffering
    if (clips.length > 0) {
      const { index: activeIndex, localTime, accumulatedTime } = getActiveClipDetails(nextGlobalTime)
      const currentClip = clips[activeIndex]

      if (currentClip) {
        const activeVideo = activeVideoSourceRef.current === 'A' ? videoA : videoB
        const standbyVideo = activeVideoSourceRef.current === 'A' ? videoB : videoA

        // If the source URL changes, load it
        if (activeVideo.src !== currentClip.url) {
          activeVideo.src = currentClip.url
          activeVideo.currentTime = localTime
          if (isPlaying) {
            activeVideo.play().catch(e => console.log(e))
          }
        }

        // Sync Speed and Volume
        activeVideo.playbackRate = currentClip.playbackSpeed
        activeVideo.volume = videoVolume

        // Ensure active video is playing/paused correctly
        if (isPlaying && activeVideo.paused) {
          activeVideo.play().catch(e => console.log(e))
        } else if (!isPlaying && !activeVideo.paused) {
          activeVideo.pause()
        }

        // Sync drift if timeline is out of sync
        if (Math.abs(activeVideo.currentTime - localTime) > 0.4) {
          activeVideo.currentTime = localTime
        }

        // Preload next clip in Standby video (Standby Buffer)
        const nextIndex = activeIndex + 1
        if (nextIndex < clips.length) {
          const nextClip = clips[nextIndex]
          if (standbyVideo.src !== nextClip.url) {
            standbyVideo.src = nextClip.url
            standbyVideo.currentTime = nextClip.startTime
            standbyVideo.pause()
          }
        }

        // Background music sync
        if (music && musicUrl) {
          music.volume = musicVolume
          if (isPlaying) {
            if (music.paused) music.play().catch(e => console.log(e))
            // Sync time
            if (Math.abs(music.currentTime - nextGlobalTime) > 0.4) {
              music.currentTime = nextGlobalTime
            }
          } else {
            music.pause()
          }
        }

        // 3. Composite Frame drawing
        const aspect = getAspectMultiplier(aspectRatio)
        const canvasHeight = canvas.height
        const canvasWidth = canvasHeight * aspect
        canvas.width = canvasWidth

        // Draw Canvas Background (Color or Image)
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)
        ctx.fillStyle = canvasBgColor
        ctx.fillRect(0, 0, canvasWidth, canvasHeight)

        if (bgImageUrl) {
          const bgImg = new Image()
          bgImg.src = bgImageUrl
          if (bgImg.complete) {
            ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight)
          }
        }

        // Draw Active Video with center crop
        const vW = activeVideo.videoWidth || 640
        const vH = activeVideo.videoHeight || 360
        const vAspect = vW / vH

        let sx = 0, sy = 0, sw = vW, sh = vH
        if (vAspect > aspect) {
          sw = vH * aspect
          sx = (vW - sw) / 2
        } else if (vAspect < aspect) {
          sh = vW / aspect
          sy = (vH - sh) / 2
        }

        // Apply filters
        ctx.filter = `brightness(${currentClip.brightness}%) contrast(${currentClip.contrast}%) saturate(${currentClip.saturate}%) blur(${currentClip.blur}px) grayscale(${currentClip.grayscale}%) sepia(${currentClip.sepia}%) hue-rotate(${currentClip.hueRotate}deg)`
        ctx.drawImage(activeVideo, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight)
        ctx.filter = 'none'

        // Apply Chroma Key pixel processing
        if (currentClip.chromaKeyEnabled) {
          const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
          const data = imgData.data
          const target = hexToRgb(currentClip.chromaKeyColor)
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i+1]
            const b = data[i+2]
            
            // Euclidean color distance
            const diff = Math.sqrt((r - target.r)**2 + (g - target.g)**2 + (b - target.b)**2)
            if (diff < currentClip.chromaKeyThreshold) {
              data[i+3] = 0 // set alpha to transparent
            }
          }
          ctx.putImageData(imgData, 0, 0)
        }

        // Draw Image layers
        imageLayers.forEach(layer => {
          const img = new Image()
          img.src = layer.url
          if (img.complete) {
            const size = (layer.scale / 100) * canvasWidth
            const w = size
            const h = (img.naturalHeight / img.naturalWidth) * size
            const x = (layer.x / 100) * canvasWidth - w / 2
            const y = (layer.y / 100) * canvasHeight - h / 2
            ctx.drawImage(img, x, y, w, h)
          }
        })

        // Draw Text layers
        textLayers.forEach(layer => {
          // Subtitle timing constraint
          if (layer.startTime !== undefined && layer.endTime !== undefined) {
            if (globalTime < layer.startTime || globalTime > layer.endTime) {
              return
            }
          }

          const scaledFontSize = layer.fontSize * (canvasHeight / 500)
          ctx.font = `bold ${scaledFontSize}px sans-serif`
          ctx.fillStyle = layer.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.strokeStyle = 'black'
          ctx.lineWidth = scaledFontSize * 0.15
          
          const x = (layer.x / 100) * canvasWidth
          const y = (layer.y / 100) * canvasHeight
          
          ctx.strokeText(layer.text, x, y)
          ctx.fillText(layer.text, x, y)
        })

        // Check if clip boundary crossed to swap buffers
        const remainingTimeInClip = currentClip.endTime - localTime
        if (remainingTimeInClip <= 0.05 && activeIndex < clips.length - 1) {
          activeVideoSourceRef.current = activeVideoSourceRef.current === 'A' ? 'B' : 'A'
        }
      }
    } else {
      // Draw Empty placeholder
      const aspect = getAspectMultiplier(aspectRatio)
      canvas.width = canvas.height * aspect
      ctx.fillStyle = '#090d16'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#334155'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No clips loaded', canvas.width / 2, canvas.height / 2)
    }

    if (isPlaying || !isExporting) {
      requestRef.current = requestAnimationFrame(runPreviewLoop)
    }
  }

  // Trigger preview loop on state updates
  useEffect(() => {
    lastTimeRef.current = performance.now()
    requestRef.current = requestAnimationFrame(runPreviewLoop)
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [isPlaying, clips, globalTime, aspectRatio, canvasBgColor, bgImageUrl, textLayers, imageLayers, musicVolume, videoVolume])

  // Split Active Clip at current time
  const handleSplitClip = () => {
    if (!selectedClipId) return
    const targetClip = clips.find(c => c.id === selectedClipId)
    if (!targetClip) return

    // Calculate current playhead position relative to this clip
    const { index, localTime } = getActiveClipDetails(globalTime)
    const clipIndex = clips.findIndex(c => c.id === selectedClipId)

    if (index !== clipIndex || localTime <= targetClip.startTime || localTime >= targetClip.endTime) {
      alert("Move the playhead inside the selected clip to split it.")
      return
    }

    const firstHalf: VideoClip = {
      ...targetClip,
      id: `clip-${Date.now()}-1`,
      endTime: localTime
    }

    const secondHalf: VideoClip = {
      ...targetClip,
      id: `clip-${Date.now()}-2`,
      startTime: localTime
    }

    const updatedClips = [...clips]
    updatedClips.splice(clipIndex, 1, firstHalf, secondHalf)
    setClips(updatedClips)
    setSelectedClipId(secondHalf.id)
  }

  // Clip sorting controls (Timeline order)
  const moveClip = (index: number, direction: 'left' | 'right') => {
    const newClips = [...clips]
    if (direction === 'left' && index > 0) {
      const temp = newClips[index]
      newClips[index] = newClips[index - 1]
      newClips[index - 1] = temp
    } else if (direction === 'right' && index < clips.length - 1) {
      const temp = newClips[index]
      newClips[index] = newClips[index + 1]
      newClips[index + 1] = temp
    }
    setClips(newClips)
  }

  // File Input Trigger helper
  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  // File Upload Handlers
  const handleAddClipFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const newClips: VideoClip[] = []
      Array.from(files).forEach((file, idx) => {
        const url = URL.createObjectURL(file)
        
        // Temporarily load video to read metadata duration
        const tempVideo = document.createElement('video')
        tempVideo.src = url
        tempVideo.onloadedmetadata = () => {
          const clip: VideoClip = {
            id: `clip-${Date.now()}-${idx}`,
            file,
            url,
            name: file.name,
            duration: tempVideo.duration,
            startTime: 0,
            endTime: tempVideo.duration,
            brightness: 100,
            contrast: 100,
            saturate: 100,
            blur: 0,
            grayscale: 0,
            sepia: 0,
            hueRotate: 0,
            playbackSpeed: 1.0,
            chromaKeyEnabled: false,
            chromaKeyColor: '#00ff00',
            chromaKeyThreshold: 45,
            transitionType: 'none',
            transitionDuration: 1.0
          }
          setClips(prev => [...prev, clip])
          if (!selectedClipId) setSelectedClipId(clip.id)
        }
      })
    }
  }

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (bgImageUrl) URL.revokeObjectURL(bgImageUrl)
      setBgImageUrl(URL.createObjectURL(file))
    }
  }

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (musicUrl) URL.revokeObjectURL(musicUrl)
      setMusicFile(file)
      setMusicUrl(URL.createObjectURL(file))
    }
  }

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      const newLayer: ImageLayer = {
        id: `img-${Date.now()}`,
        file,
        url,
        name: file.name,
        x: 50,
        y: 50,
        scale: 30
      }
      setImageLayers(prev => [...prev, newLayer])
      setSelectedImageId(newLayer.id)
      setActiveTab('stickers')
    }
  }

  // Draggable Sticker pointer events
  const handleImagePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    setSelectedImageId(id)
    const layer = imageLayers.find(img => img.id === id)
    if (!layer) return

    const container = e.currentTarget.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()

    const startX = e.clientX
    const startY = e.clientY
    const startXPercent = layer.x
    const startYPercent = layer.y

    e.currentTarget.setPointerCapture(e.pointerId)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      const dxPercent = (dx / rect.width) * 100
      const dyPercent = (dy / rect.height) * 100

      setImageLayers(prev => prev.map(img => {
        if (img.id === id) {
          return {
            ...img,
            x: Math.max(0, Math.min(100, startXPercent + dxPercent)),
            y: Math.max(0, Math.min(100, startYPercent + dyPercent))
          }
        }
        return img
      }))
    }

    const handlePointerUp = () => {
      e.currentTarget.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleDeleteSticker = (id: string) => {
    setImageLayers(prev => prev.filter(img => img.id !== id))
    if (selectedImageId === id) setSelectedImageId(null)
  }

  const handleTimelineClipClick = (clipId: string) => {
    setSelectedClipId(clipId)
    // Seek playhead to start of this clip on timeline
    let accumulated = 0
    for (let i = 0; i < clips.length; i++) {
      if (clips[i].id === clipId) {
        setGlobalTime(accumulated)
        if (videoRefA.current) videoRefA.current.currentTime = clips[i].startTime
        break
      }
      accumulated += (clips[i].endTime - clips[i].startTime)
    }
  }

  // Update specific selected clip property
  const updateSelectedClip = (updater: (clip: VideoClip) => Partial<VideoClip>) => {
    if (!selectedClipId) return
    setClips(prev => prev.map(c => c.id === selectedClipId ? { ...c, ...updater(c) } : c))
  }

  // Voice Recording handlers
  const toggleVoiceRecording = async () => {
    if (isRecordingVoice) {
      if (mediaRecorderVoiceRef.current && mediaRecorderVoiceRef.current.state !== 'inactive') {
        mediaRecorderVoiceRef.current.stop()
      }
      setIsRecordingVoice(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        voiceChunksRef.current = []
        const recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) voiceChunksRef.current.push(e.data)
        }
        recorder.onstop = async () => {
          const blob = new Blob(voiceChunksRef.current, { type: 'audio/webm' })
          const arrayBuffer = await blob.arrayBuffer()
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
          setVoiceSignatureBuffer(audioBuffer)
          const pitch = detectPitch(audioBuffer)
          setUserVoicePitch(pitch)
          stream.getTracks().forEach(t => t.stop())
        }
        mediaRecorderVoiceRef.current = recorder
        recorder.start()
        setIsRecordingVoice(true)
        // Auto stop after 3 seconds
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop()
            setIsRecordingVoice(false)
          }
        }, 3000)
      } catch (e) {
        console.error('Error recording voice:', e)
        alert('Could not access microphone.')
      }
    }
  }

  // Speech to Text logic
  const handleAutoTranscribeClip = async () => {
    if (!selectedClipId) return
    const clip = clips.find(c => c.id === selectedClipId)
    if (!clip) return

    setIsTranscribing(true)
    setTranscriptionProgress(0)
    setTranscriptionStatusText('Extracting audio from video...')

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      const response = await fetch(clip.url)
      const arrayBuffer = await response.arrayBuffer()
      setTranscriptionStatusText('Decoding audio data...')
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      
      setTranscriptionStatusText('Spawning Whisper AI worker...')
      const float32Data = audioBuffer.getChannelData(0)

      const worker = new Worker(
        new URL('../transcription.worker.ts', import.meta.url),
        { type: 'module' }
      )

      worker.onmessage = (event) => {
        const { status, file, progress, result, error } = event.data
        if (status === 'progress') {
          setTranscriptionProgress(Math.round(progress))
          setTranscriptionStatusText(`Loading Whisper AI model... (${Math.round(progress)}%)`)
        } else if (status === 'transcribing') {
          setTranscriptionStatusText('Transcribing audio...')
          setTranscriptionProgress(60)
        } else if (status === 'completed') {
          setTranscriptionStatusText('Completed!')
          setIsTranscribing(false)
          worker.terminate()
          
          if (result && result.chunks) {
            // Save transcript to clip
            setClips(prev => prev.map(c => c.id === clip.id ? { 
              ...c, 
              transcription: {
                text: result.text,
                chunks: result.chunks.map((ch: any) => ({
                  text: ch.text,
                  timestamp: ch.timestamp
                }))
              }
            } : c))

            // Timed Text layers
            let accumulated = 0
            for (let i = 0; i < clips.length; i++) {
              if (clips[i].id === clip.id) break
              accumulated += (clips[i].endTime - clips[i].startTime)
            }

            const newLayers: TextLayer[] = result.chunks.map((ch: any, idx: number) => {
              const start = accumulated + (ch.timestamp[0] - clip.startTime)
              const end = accumulated + (ch.timestamp[1] - clip.startTime)
              return {
                id: `caption-${Date.now()}-${idx}`,
                text: ch.text.trim(),
                color: '#fbbf24', // yellow captions
                fontSize: 20,
                x: 50,
                y: 82, // bottom center placement
                startTime: Math.max(0, start),
                endTime: Math.max(0, end)
              }
            })

            setTextLayers(prev => [...prev, ...newLayers])
          }
        } else if (status === 'error') {
          setIsTranscribing(false)
          alert(`Transcription worker error: ${error}`)
          worker.terminate()
        }
      }

      worker.postMessage({ audio: float32Data })

    } catch (err: any) {
      console.error(err)
      setIsTranscribing(false)
      alert(`Transcription failed: ${err.message || String(err)}`)
    }
  }

  // Jump-Cut Filler Word Cutter
  const handleTrimFillerWords = () => {
    if (!selectedClipId) return
    const clip = clips.find(c => c.id === selectedClipId)
    if (!clip || !clip.transcription || !clip.transcription.chunks) {
      alert("Please generate auto captions first to analyze the speech.")
      return
    }

    const chunks = clip.transcription.chunks
    const fillerRegex = /\b(um|uh|ah|eh|err|like)\b/i

    const garbageIntervals: Array<[number, number]> = []
    chunks.forEach(ch => {
      if (fillerRegex.test(ch.text) && ch.timestamp) {
        garbageIntervals.push([ch.timestamp[0], ch.timestamp[1]])
      }
    })

    if (garbageIntervals.length === 0) {
      alert("No verbal fillers ('um', 'uh', 'ah', 'like', 'err') detected in this clip!")
      return
    }

    const activeStart = clip.startTime
    const activeEnd = clip.endTime

    const filteredGarbage = garbageIntervals
      .map(([s, e]) => [Math.max(activeStart, s), Math.min(activeEnd, e)] as [number, number])
      .filter(([s, e]) => e - s > 0.05)

    filteredGarbage.sort((a, b) => a[0] - b[0])
    const mergedGarbage: Array<[number, number]> = []
    for (const interval of filteredGarbage) {
      if (mergedGarbage.length === 0) {
        mergedGarbage.push(interval)
      } else {
        const last = mergedGarbage[mergedGarbage.length - 1]
        if (interval[0] <= last[1]) {
          last[1] = Math.max(last[1], interval[1])
        } else {
          mergedGarbage.push(interval)
        }
      }
    }

    const cleanIntervals: Array<[number, number]> = []
    let currentStart = activeStart

    for (const [gStart, gEnd] of mergedGarbage) {
      if (gStart > currentStart + 0.1) {
        cleanIntervals.push([currentStart, gStart])
      }
      currentStart = gEnd
    }

    if (activeEnd > currentStart + 0.1) {
      cleanIntervals.push([currentStart, activeEnd])
    }

    if (cleanIntervals.length === 0) {
      alert("Auto trim would delete the entire clip! Trimming aborted.")
      return
    }

    const clipIndex = clips.findIndex(c => c.id === selectedClipId)
    const slicedClips: VideoClip[] = cleanIntervals.map((interval, idx) => ({
      ...clip,
      id: `clip-${Date.now()}-cut-${idx}`,
      startTime: interval[0],
      endTime: interval[1],
      name: `${clip.name} (Clean ${idx + 1})`
    }))

    const updatedClips = [...clips]
    updatedClips.splice(clipIndex, 1, ...slicedClips)
    setClips(updatedClips)
    setSelectedClipId(slicedClips[0].id)
    alert(`Successfully cut out ${mergedGarbage.length} verbal filler(s). Split clip into ${slicedClips.length} clean segment(s).`)
  }

  // TTS + Voice Cloning generator
  const handleGenerateTtsVoiceover = async () => {
    if (!ttsText.trim()) return
    setIsGeneratingTts(true)

    try {
      const text = encodeURIComponent(ttsText)
      const ttsUrl = `https://api.streamelements.com/api/v2/speech?voice=${selectedBaseVoice}&text=${text}`
      
      const res = await fetch(ttsUrl)
      if (!res.ok) throw new Error('Failed to retrieve TTS audio.')
      
      const arrayBuffer = await res.arrayBuffer()
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const rawAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      
      let finalAudioBuffer = rawAudioBuffer

      // Apply Voice Cloning pitch modulator
      if (userVoicePitch) {
        // Base voice pitch approximations: 
        // Female voices like Amy, Salli are ~200Hz.
        // Male voices like Brian, Joey are ~110Hz.
        const baseFemaleVoices = ['Amy', 'Salli', 'Kendra', 'Kimberly', 'Emma', 'Nicole', 'Mizuki', 'Carla', 'Celine']
        const basePitch = baseFemaleVoices.includes(selectedBaseVoice) ? 200 : 110
        const semitones = 12 * Math.log2(userVoicePitch / basePitch)
        
        finalAudioBuffer = pitchShiftBuffer(rawAudioBuffer, semitones, audioCtx)
      }

      // Convert buffer to WAV file blob
      const wavBlob = audioBufferToWav(finalAudioBuffer)
      const wavFile = new File([wavBlob], `voiceover_${Date.now()}.wav`, { type: 'audio/wav' })
      const wavUrl = URL.createObjectURL(wavBlob)

      setMusicFile(wavFile)
      setMusicUrl(wavUrl)
      setIsGeneratingTts(false)
      alert('Successfully generated TTS voiceover and loaded it as background track!')
    } catch (e: any) {
      console.error(e)
      setIsGeneratingTts(false)
      alert(`Voice generator failed: ${e.message || String(e)}`)
    }
  }

  // Initialize MediaPipe Face Landmarker
  const initFaceLandmarker = async () => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current

    try {
      // Dynamic ES module import from CDN
      const { FilesetResolver, FaceLandmarker } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs"
      )

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      )

      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO"
      })

      faceLandmarkerRef.current = landmarker
      return landmarker
    } catch (err) {
      console.error("Failed to load FaceLandmarker:", err)
      alert("Failed to load AI Face Tracker. Check your internet connection.")
      throw err
    }
  }

  // AI Puppeteer: Start Webcam and init tracking
  const toggleWebcam = async () => {
    if (isWebcamActive) {
      stopWebcamTracking()
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream
          webcamVideoRef.current.onloadedmetadata = () => {
            webcamVideoRef.current?.play()
            setIsWebcamActive(true)
            initFaceLandmarker().then((landmarker) => {
              runPuppetLoop(landmarker)
            })
          }
        }
      } catch (e) {
        console.error(e)
        alert("Could not access camera or microphone. Please check permissions.")
      }
    }
  }

  // Stop Webcam tracking
  const stopWebcamTracking = () => {
    setIsWebcamActive(false)
    if (avatarAnimationRef.current) {
      cancelAnimationFrame(avatarAnimationRef.current)
      avatarAnimationRef.current = null
    }
    if (webcamVideoRef.current && webcamVideoRef.current.srcObject) {
      const stream = webcamVideoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(t => t.stop())
      webcamVideoRef.current.srcObject = null
    }
  }

  // Running the puppeteer frame loop
  const runPuppetLoop = (landmarker: any) => {
    const video = webcamVideoRef.current
    const canvas = avatarCanvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 400
    canvas.height = 400

    let lastVideoTime = -1
    const renderFrame = () => {
      if (!webcamVideoRef.current || webcamVideoRef.current.paused || webcamVideoRef.current.ended) return

      const timestamp = performance.now()
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        try {
          const result = landmarker.detectForVideo(video, timestamp)
          drawPuppet(ctx, canvas.width, canvas.height, result)
        } catch (e) {
          // ignore tracking frame errors
        }
      }
      avatarAnimationRef.current = requestAnimationFrame(renderFrame)
    }

    avatarAnimationRef.current = requestAnimationFrame(renderFrame)
  }

  // Draw the selected puppet onto the canvas based on face landmarker results
  const drawPuppet = (ctx: CanvasRenderingContext2D, width: number, height: number, result: any) => {
    ctx.clearRect(0, 0, width, height)
    
    // Background color
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)

    let blinkL = 0
    let blinkR = 0
    let mouthOpen = 0
    let roll = 0
    let yaw = 0
    let pitch = 0

    if (result.faceBlendshapes && result.faceBlendshapes[0]) {
      const categories = result.faceBlendshapes[0].categories
      const leftBlinkCat = categories.find((c: any) => c.categoryName === 'eyeBlinkLeft')
      const rightBlinkCat = categories.find((c: any) => c.categoryName === 'eyeBlinkRight')
      const jawOpenCat = categories.find((c: any) => c.categoryName === 'jawOpen')
      if (leftBlinkCat) blinkL = leftBlinkCat.score
      if (rightBlinkCat) blinkR = rightBlinkCat.score
      if (jawOpenCat) mouthOpen = jawOpenCat.score
    }

    if (result.faceLandmarks && result.faceLandmarks[0]) {
      const landmarks = result.faceLandmarks[0]
      const eyeL = landmarks[33]
      const eyeR = landmarks[263]
      if (eyeL && eyeR) {
        roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x)
      }
      const nose = landmarks[4]
      const forehead = landmarks[10]
      const chin = landmarks[152]
      const cheekL = landmarks[234]
      const cheekR = landmarks[454]
      
      if (nose && cheekL && cheekR) {
        const dL = Math.hypot(nose.x - cheekL.x, nose.y - cheekL.y)
        const dR = Math.hypot(nose.x - cheekR.x, nose.y - cheekR.y)
        yaw = (dL - dR) / (dL + dR)
      }
      if (nose && forehead && chin) {
        const dT = Math.hypot(forehead.x - nose.x, forehead.y - nose.y)
        const dB = Math.hypot(chin.x - nose.x, chin.y - nose.y)
        pitch = (dT - dB) / (dT + dB)
      }
    }

    const cx = width / 2
    const cy = height / 2 + 20

    ctx.save()
    // Apply head pose translations and rotations
    ctx.translate(cx + (yaw * -40), cy + (pitch * -30))
    ctx.rotate(roll)

    if (selectedAvatar === 'robot') {
      // Neck
      ctx.fillStyle = '#1e293b'
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.rect(-30, 40, 60, 40)
      ctx.fill(); ctx.stroke()
      
      // Head casing
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.roundRect(-70, -80, 140, 130, 15)
      ctx.fill(); ctx.stroke()

      // Ears / Antennas
      ctx.beginPath()
      ctx.moveTo(-70, -20); ctx.lineTo(-85, -20); ctx.lineTo(-85, -30); ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(70, -20); ctx.lineTo(85, -20); ctx.lineTo(85, -30); ctx.closePath()
      ctx.fill(); ctx.stroke()

      // Visor
      ctx.fillStyle = '#111827'
      ctx.beginPath()
      ctx.roundRect(-55, -45, 110, 30, 5)
      ctx.fill(); ctx.stroke()

      // Glowing Visor
      ctx.strokeStyle = '#f43f5e'
      ctx.lineWidth = 3
      ctx.shadowColor = '#f43f5e'
      ctx.shadowBlur = 10
      
      if (blinkL > 0.5 || blinkR > 0.5) {
        ctx.beginPath()
        ctx.moveTo(-45, -30); ctx.lineTo(-10, -30)
        ctx.moveTo(10, -30); ctx.lineTo(45, -30)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#f43f5e'
        ctx.beginPath()
        ctx.ellipse(-25, -30, 12, 8, 0, 0, Math.PI * 2)
        ctx.ellipse(25, -30, 12, 8, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // Mouth Speaker
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 4
      ctx.shadowColor = '#38bdf8'
      ctx.shadowBlur = 5
      const mouthHeight = Math.max(2, mouthOpen * 25)
      const barXOffsets = [-20, -10, 0, 10, 20]
      barXOffsets.forEach((bx, idx) => {
        const factor = idx % 2 === 0 ? 1.0 : 0.6
        const h = mouthHeight * factor
        ctx.beginPath()
        ctx.moveTo(bx, 15 - h)
        ctx.lineTo(bx, 15 + h)
        ctx.stroke()
      })
      ctx.shadowBlur = 0
    } 
    else if (selectedAvatar === 'kitty') {
      // Neck
      ctx.fillStyle = '#e2e8f0'
      ctx.strokeStyle = '#f472b6'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.rect(-20, 50, 40, 30)
      ctx.fill(); ctx.stroke()

      // Ears
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.moveTo(-65, -50); ctx.lineTo(-75, -110); ctx.lineTo(-20, -75); ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(65, -50); ctx.lineTo(75, -110); ctx.lineTo(20, -75); ctx.closePath()
      ctx.fill(); ctx.stroke()

      // Inner Ear
      ctx.fillStyle = '#f472b6'
      ctx.beginPath()
      ctx.moveTo(-60, -55); ctx.lineTo(-68, -100); ctx.lineTo(-25, -73); ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(60, -55); ctx.lineTo(68, -100); ctx.lineTo(25, -73); ctx.closePath()
      ctx.fill()

      // Head
      ctx.fillStyle = '#e2e8f0'
      ctx.strokeStyle = '#f472b6'
      ctx.beginPath()
      ctx.ellipse(0, -10, 75, 65, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()

      // Whiskers
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-65, -5); ctx.lineTo(-95, -10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-65, 5); ctx.lineTo(-95, 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(65, -5); ctx.lineTo(95, -10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(65, 5); ctx.lineTo(95, 10); ctx.stroke()

      // Eyes
      ctx.fillStyle = '#334155'
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 3
      if (blinkL > 0.5) {
        ctx.beginPath(); ctx.arc(-30, -20, 10, Math.PI, 0, false); ctx.stroke()
      } else {
        ctx.beginPath(); ctx.ellipse(-30, -20, 12, 16, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(-26, -24, 4, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = '#334155'
      if (blinkR > 0.5) {
        ctx.beginPath(); ctx.arc(30, -20, 10, Math.PI, 0, false); ctx.stroke()
      } else {
        ctx.beginPath(); ctx.ellipse(30, -20, 12, 16, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.arc(34, -24, 4, 0, Math.PI * 2); ctx.fill()
      }

      // Nose
      ctx.fillStyle = '#f472b6'
      ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill()

      // Mouth
      if (mouthOpen > 0.1) {
        const mouthHeight = mouthOpen * 30
        ctx.fillStyle = '#be185d'
        ctx.beginPath(); ctx.ellipse(0, 15, 10, mouthHeight, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#fda4af'
        ctx.beginPath(); ctx.ellipse(0, 15 + mouthHeight/2, 6, mouthHeight/3, 0, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.strokeStyle = '#334155'
        ctx.beginPath(); ctx.arc(-5, 8, 5, 0, Math.PI, false); ctx.arc(5, 8, 5, 0, Math.PI, false); ctx.stroke()
      }
    } 
    else if (selectedAvatar === 'demon') {
      // Neck
      ctx.fillStyle = '#1e1b4b'
      ctx.strokeStyle = '#a855f7'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-25, 40); ctx.lineTo(-40, 80); ctx.lineTo(40, 80); ctx.lineTo(25, 40); ctx.closePath()
      ctx.fill(); ctx.stroke()

      // Horns
      ctx.fillStyle = '#ef4444'
      ctx.strokeStyle = '#7f1d1d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-50, -60); ctx.quadraticCurveTo(-90, -110, -50, -130); ctx.quadraticCurveTo(-70, -90, -25, -75); ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(50, -60); ctx.quadraticCurveTo(90, -110, 50, -130); ctx.quadraticCurveTo(70, -90, 25, -75); ctx.closePath()
      ctx.fill(); ctx.stroke()

      // Head
      ctx.fillStyle = '#090514'
      ctx.strokeStyle = '#a855f7'
      ctx.beginPath(); ctx.ellipse(0, -10, 65, 75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

      // Eyes
      ctx.shadowColor = '#d8b4fe'
      ctx.shadowBlur = 12
      if (blinkL > 0.5) {
        ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-40, -15); ctx.lineTo(-15, -10); ctx.stroke()
      } else {
        ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.moveTo(-45, -25); ctx.lineTo(-15, -15); ctx.lineTo(-35, -5); ctx.closePath(); ctx.fill()
      }
      if (blinkR > 0.5) {
        ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(15, -10); ctx.lineTo(40, -15); ctx.stroke()
      } else {
        ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.moveTo(45, -25); ctx.lineTo(15, -15); ctx.lineTo(35, -5); ctx.closePath(); ctx.fill()
      }
      ctx.shadowBlur = 0

      // Fangs
      ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2
      if (mouthOpen > 0.1) {
        const mouthHeight = mouthOpen * 25
        ctx.fillStyle = '#ef4444'
        ctx.beginPath(); ctx.ellipse(0, 20, 15, mouthHeight, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath(); ctx.moveTo(-10, 20 - mouthHeight); ctx.lineTo(-5, 20 - mouthHeight + 8); ctx.lineTo(0, 20 - mouthHeight); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(0, 20 - mouthHeight); ctx.lineTo(5, 20 - mouthHeight + 8); ctx.lineTo(10, 20 - mouthHeight); ctx.closePath(); ctx.fill()
      } else {
        ctx.beginPath(); ctx.moveTo(-20, 20); ctx.lineTo(0, 15); ctx.lineTo(20, 20); ctx.stroke()
      }
    }

    ctx.restore()
  }

  // Record AI Avatar canvas session
  const toggleAvatarRecording = () => {
    if (isRecordingAvatar) {
      if (avatarRecorderRef.current && avatarRecorderRef.current.state !== 'inactive') {
        avatarRecorderRef.current.stop()
      }
      setIsRecordingAvatar(false)
    } else {
      const canvas = avatarCanvasRef.current
      if (!canvas) return
      
      const canvasStream = canvas.captureStream(30)
      const combinedTracks = [...canvasStream.getVideoTracks()]
      
      const micStream = webcamVideoRef.current?.srcObject as MediaStream
      if (micStream && micStream.getAudioTracks().length > 0) {
        combinedTracks.push(micStream.getAudioTracks()[0])
      }
      
      const combinedStream = new MediaStream(combinedTracks)
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' })
      } catch (e) {
        recorder = new MediaRecorder(combinedStream)
      }
      
      avatarChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) avatarChunksRef.current.push(e.data)
      }
      
      recorder.onstop = () => {
        const blob = new Blob(avatarChunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        
        const newClip: VideoClip = {
          id: `avatar-${Date.now()}`,
          file: new File([blob], `avatar_puppet_${Date.now()}.webm`, { type: 'video/webm' }),
          url,
          name: `AI Puppet (${selectedAvatar})`,
          duration: avatarRecordingDuration || 5,
          startTime: 0,
          endTime: avatarRecordingDuration || 5,
          brightness: 100,
          contrast: 100,
          saturate: 100,
          blur: 0,
          grayscale: 0,
          sepia: 0,
          hueRotate: 0,
          playbackSpeed: 1.0,
          chromaKeyEnabled: true,
          chromaKeyColor: '#0f172a', // slate-900 background makes green-screen keying trivial!
          chromaKeyThreshold: 35,
          transitionType: 'none',
          transitionDuration: 1.0
        }
        
        setClips(prev => [...prev, newClip])
        setSelectedClipId(newClip.id)
        
        // Stop camera tracks to save resources
        stopWebcamTracking()
      }
      
      setAvatarRecordingDuration(0)
      avatarRecorderRef.current = recorder
      recorder.start()
      setIsRecordingAvatar(true)
    }
  }

  // Timer Effect for Avatar recording duration
  useEffect(() => {
    let interval: any = null
    if (isRecordingAvatar) {
      interval = setInterval(() => {
        setAvatarRecordingDuration(prev => prev + 1)
      }, 1000)
    } else {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [isRecordingAvatar])

  // Cleanup webcam tracks on exit
  useEffect(() => {
    return () => {
      stopWebcamTracking()
    }
  }, [])

  const handleTextLayerAdd = () => {
    const newText: TextLayer = {
      id: `text-${Date.now()}`,
      text: 'Double Click to Edit',
      color: '#ffffff',
      fontSize: 24,
      x: 50,
      y: 50
    }
    setTextLayers(prev => [...prev, newText])
    setSelectedTextId(newText.id)
    setActiveTab('text')
  }

  const handleUpdateTextValue = (id: string, value: string) => {
    setTextLayers(prev => prev.map(t => t.id === id ? { ...t, text: value } : t))
  }

  const handleUpdateTextSize = (id: string, size: number) => {
    setTextLayers(prev => prev.map(t => t.id === id ? { ...t, fontSize: size } : t))
  }

  const handleUpdateTextColor = (id: string, color: string) => {
    setTextLayers(prev => prev.map(t => t.id === id ? { ...t, color } : t))
  }

  const handleDeleteTextLayer = (id: string) => {
    setTextLayers(prev => prev.filter(t => t.id !== id))
    if (selectedTextId === id) setSelectedTextId(null)
  }

  // Web Audio Mixer + Canvas Frame Export Loop
  const handleExport = async () => {
    if (clips.length === 0) return

    setIsExporting(true)
    setExportProgress(0)
    setExportedUrl('')
    setExportError('')
    recordedChunksRef.current = []

    const videoA = videoRefA.current
    const videoB = videoRefB.current
    const music = audioMusicRef.current

    if (!videoA || !videoB) {
      setExportError('Video elements not loaded.')
      setIsExporting(false)
      return
    }

    // Cancel preview animation frame loop
    if (requestRef.current) cancelAnimationFrame(requestRef.current)

    try {
      // Pause all playing
      videoA.pause()
      videoB.pause()
      if (music) music.pause()

      // Create hidden export canvas
      const canvas = document.createElement('canvas')
      const targetHeight = clips[0].file ? 720 : 480
      const targetAspect = getAspectMultiplier(aspectRatio)
      const targetWidth = targetHeight * targetAspect

      canvas.height = targetHeight
      canvas.width = targetWidth

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not create canvas context.')

      // Audio Context setup and connection checking
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const audioCtx = audioContextRef.current
      const dest = audioCtx.createMediaStreamDestination()

      // Connect Video A Audio (if not already connected)
      if (!audioNodesRef.current.videoA) {
        try {
          const sourceA = audioCtx.createMediaElementSource(videoA)
          const gainA = audioCtx.createGain()
          sourceA.connect(gainA)
          gainA.connect(dest)
          gainA.connect(audioCtx.destination)
          audioNodesRef.current.videoA = gainA
        } catch (e) {
          console.warn('Video A Audio already connected')
        }
      }
      audioNodesRef.current.videoA.gain.value = videoVolume

      // Connect Video B Audio
      if (!audioNodesRef.current.videoB) {
        try {
          const sourceB = audioCtx.createMediaElementSource(videoB)
          const gainB = audioCtx.createGain()
          sourceB.connect(gainB)
          gainB.connect(dest)
          gainB.connect(audioCtx.destination)
          audioNodesRef.current.videoB = gainB
        } catch (e) {
          console.warn('Video B Audio already connected')
        }
      }
      audioNodesRef.current.videoB.gain.value = videoVolume

      // Connect Background Music Audio
      if (music && !audioNodesRef.current.music) {
        try {
          const sourceM = audioCtx.createMediaElementSource(music)
          const gainM = audioCtx.createGain()
          sourceM.connect(gainM)
          gainM.connect(dest)
          gainM.connect(audioCtx.destination)
          audioNodesRef.current.music = gainM
        } catch (e) {
          console.warn('Music Audio already connected')
        }
      }
      if (audioNodesRef.current.music) {
        audioNodesRef.current.music.gain.value = musicVolume
      }

      // Record mixed stream from canvas + mixed audio
      const canvasStream = canvas.captureStream(30)
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]
      const combinedStream = new MediaStream(combinedTracks)

      const options = { mimeType: 'video/webm;codecs=vp9,opus' }
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(combinedStream, options)
      } catch (e) {
        recorder = new MediaRecorder(combinedStream)
      }

      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        setExportedUrl(url)
        setIsExporting(false)
        setExportProgress(100)
        // Resume preview loop
        requestRef.current = requestAnimationFrame(runPreviewLoop)
      }

      // Start Recording
      recorder.start()

      // Sequential Renderer
      let currentExportTime = 0
      let activeIdx = 0
      let currentBuf: 'A' | 'B' = 'A'

      // Preload first clip
      const firstClip = clips[0]
      const mainVid = videoA
      mainVid.src = firstClip.url
      mainVid.currentTime = firstClip.startTime
      mainVid.playbackRate = firstClip.playbackSpeed
      mainVid.volume = videoVolume

      if (music) {
        music.currentTime = 0
        music.volume = musicVolume
        music.play().catch(e => console.log(e))
      }

      // Wait for seek
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          mainVid.removeEventListener('seeked', onSeeked)
          resolve()
        }
        mainVid.addEventListener('seeked', onSeeked)
      })

      mainVid.play()

      const drawExportFrame = () => {
        if (currentExportTime >= totalDuration) {
          mainVid.pause()
          videoB.pause()
          if (music) music.pause()
          recorder.stop()
          return
        }

        // Get details of active clip relative to export time
        const { index, localTime } = getActiveClipDetails(currentExportTime)
        const clip = clips[index]

        if (clip) {
          const currentVid = currentBuf === 'A' ? videoA : videoB
          const nextVid = currentBuf === 'A' ? videoB : videoA

          // Check if index updated (need to swap clip)
          if (index !== activeIdx) {
            activeIdx = index
            currentVid.pause()
            
            // Swap buffer
            currentBuf = currentBuf === 'A' ? 'B' : 'A'
            const newActiveVid = currentBuf === 'A' ? videoA : videoB
            newActiveVid.src = clip.url
            newActiveVid.currentTime = localTime
            newActiveVid.playbackRate = clip.playbackSpeed
            newActiveVid.volume = videoVolume
            newActiveVid.play()
          }

          // Preload next clip in background
          if (index + 1 < clips.length) {
            const nextClip = clips[index + 1]
            if (nextVid.src !== nextClip.url) {
              nextVid.src = nextClip.url
              nextVid.currentTime = nextClip.startTime
              nextVid.pause()
            }
          }

          // Draw Canvas Frame
          ctx.clearRect(0, 0, canvasWidth, canvasHeight)
          ctx.fillStyle = canvasBgColor
          ctx.fillRect(0, 0, canvasWidth, canvasHeight)

          if (bgImageUrl) {
            const bgImg = new Image()
            bgImg.src = bgImageUrl
            if (bgImg.complete) {
              ctx.drawImage(bgImg, 0, 0, canvasWidth, canvasHeight)
            }
          }

          const vW = currentVid.videoWidth || 640
          const vH = currentVid.videoHeight || 360
          const vAspect = vW / vH

          let sx = 0, sy = 0, sw = vW, sh = vH
          if (vAspect > targetAspect) {
            sw = vH * targetAspect
            sx = (vW - sw) / 2
          } else if (vAspect < targetAspect) {
            sh = vW / targetAspect
            sy = (vH - sh) / 2
          }

          // Apply filters
          ctx.filter = `brightness(${clip.brightness}%) contrast(${clip.contrast}%) saturate(${clip.saturate}%) blur(${clip.blur}px) grayscale(${clip.grayscale}%) sepia(${clip.sepia}%) hue-rotate(${clip.hueRotate}deg)`
          ctx.drawImage(currentVid, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight)
          ctx.filter = 'none'

          // Apply Chroma Key
          if (clip.chromaKeyEnabled) {
            const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight)
            const data = imgData.data
            const target = hexToRgb(clip.chromaKeyColor)
            
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i]
              const g = data[i+1]
              const b = data[i+2]
              const diff = Math.sqrt((r - target.r)**2 + (g - target.g)**2 + (b - target.b)**2)
              if (diff < clip.chromaKeyThreshold) {
                data[i+3] = 0
              }
            }
            ctx.putImageData(imgData, 0, 0)
          }

          // Draw Images/Stickers
          imageLayers.forEach(layer => {
            const img = new Image()
            img.src = layer.url
            if (img.complete) {
              const size = (layer.scale / 100) * canvasWidth
              const w = size
              const h = (img.naturalHeight / img.naturalWidth) * size
              const x = (layer.x / 100) * canvasWidth - w / 2
              const y = (layer.y / 100) * canvasHeight - h / 2
              ctx.drawImage(img, x, y, w, h)
            }
          })

          // Draw Texts
          textLayers.forEach(layer => {
            // Subtitle timing constraint
            if (layer.startTime !== undefined && layer.endTime !== undefined) {
              if (currentExportTime < layer.startTime || currentExportTime > layer.endTime) {
                return
              }
            }

            const scaledFontSize = layer.fontSize * (canvasHeight / 500)
            ctx.font = `bold ${scaledFontSize}px sans-serif`
            ctx.fillStyle = layer.color
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.strokeStyle = 'black'
            ctx.lineWidth = scaledFontSize * 0.15
            
            const x = (layer.x / 100) * canvasWidth
            const y = (layer.y / 100) * canvasHeight
            
            ctx.strokeText(layer.text, x, y)
            ctx.fillText(layer.text, x, y)
          })
        }

        // Increment time (30 frames/sec = ~0.033s per frame)
        currentExportTime += 0.0333
        const progress = Math.min(Math.round((currentExportTime / totalDuration) * 100), 99)
        setExportProgress(progress)

        setTimeout(drawExportFrame, 33)
      }

      drawExportFrame()

    } catch (err: any) {
      console.error(err)
      setExportError(err.message || 'Export failed.')
      setIsExporting(false)
      requestRef.current = requestAnimationFrame(runPreviewLoop)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    const centiseconds = Math.floor((time % 1) * 100)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }

  const colors = [
    '#ffffff', '#000000', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'
  ]

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-600 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 shadow-lg shadow-purple-500/20 animate-pulse">
            <Scissors className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              OpenCut Studio
            </h1>
            <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">
              CapCut-Like Browser Suite
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerFileInput}
            className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-500/10 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Clips
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-xs text-slate-400 md:flex">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span>Chroma Key & Multi-Clip enabled</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        {/* Left Columns: Preview Canvas & Timeline */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Player Container */}
          <div className="flex-1 min-h-[400px] flex items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/10 backdrop-blur-sm relative p-4">
            <div 
              className={`relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center transition-all duration-300 ${
                aspectRatio === '16:9' ? 'w-full max-w-[700px] aspect-video' :
                aspectRatio === '9:16' ? 'h-[500px] aspect-[9/16]' :
                'h-[500px] aspect-square'
              }`}
            >
              {/* Double Buffering Videos (Hidden) */}
              <video ref={videoRefA} className="hidden" crossOrigin="anonymous" playsInline muted />
              <video ref={videoRefB} className="hidden" crossOrigin="anonymous" playsInline muted />
              <video ref={webcamVideoRef} className="hidden" playsInline muted />
              <audio ref={audioMusicRef} className="hidden" src={musicUrl} />

              {/* Composited Preview Canvas */}
              <canvas
                ref={previewCanvasRef}
                height={500}
                className="w-full h-full object-contain"
              />

              {/* Draggable Overlays Container */}
              <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
                {/* Drag Text layers */}
                {textLayers.map((layer) => (
                  <div
                    key={layer.id}
                    onPointerDown={(e) => handleTextPointerDown(e, layer.id)}
                    className={`absolute pointer-events-auto select-none cursor-move px-3 py-1.5 rounded-lg border font-sans font-bold text-center transform -translate-x-1/2 -translate-y-1/2 ${
                      selectedTextId === layer.id 
                        ? 'border-purple-500 bg-purple-600/20 shadow-lg shadow-purple-500/20' 
                        : 'border-transparent bg-transparent hover:border-slate-800 hover:bg-slate-900/30'
                    }`}
                    style={{
                      left: `${layer.x}%`,
                      top: `${layer.y}%`,
                      color: layer.color,
                      fontSize: `${layer.fontSize}px`,
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                    }}
                  >
                    {layer.text}
                  </div>
                ))}

                {/* Drag Image layers */}
                {imageLayers.map((layer) => (
                  <div
                    key={layer.id}
                    onPointerDown={(e) => handleImagePointerDown(e, layer.id)}
                    className={`absolute pointer-events-auto select-none cursor-move transform -translate-x-1/2 -translate-y-1/2 border rounded overflow-hidden ${
                      selectedImageId === layer.id 
                        ? 'border-purple-500 bg-purple-600/10 shadow-lg' 
                        : 'border-transparent hover:border-slate-800 hover:bg-slate-900/10'
                    }`}
                    style={{
                      left: `${layer.x}%`,
                      top: `${layer.y}%`,
                      width: `${layer.scale}%`
                    }}
                  >
                    <img src={layer.url} alt={layer.name} className="w-full pointer-events-none" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline & Playback Panel */}
          {clips.length > 0 && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm space-y-6">
              {/* Media Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlay}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600 text-white shadow-lg hover:bg-purple-500 active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white ml-0.5" />}
                  </button>
                  <button
                    onClick={toggleMute}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={handleSplitClip}
                    disabled={!selectedClipId}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/50 text-xs text-slate-400 hover:text-purple-400 transition-colors disabled:opacity-50"
                    title="Split selected clip at current global playhead"
                  >
                    <Scissors className="h-4 w-4" />
                    <span>Split Clip</span>
                  </button>
                </div>

                <div className="flex items-center gap-6 text-sm text-slate-400 font-mono">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 uppercase">Global Playhead</span>
                    <span className="text-white font-semibold">{formatTime(globalTime)}</span>
                  </div>
                  <div className="h-8 w-px bg-slate-800"></div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 uppercase">Total Duration</span>
                    <span className="text-purple-400 font-semibold">{formatTime(totalDuration)}</span>
                  </div>
                </div>
              </div>

              {/* Multi-Clip Timeline Tracks */}
              <div className="space-y-4 pt-2">
                <div className="relative h-20 bg-slate-950 border border-slate-900 rounded-xl overflow-hidden flex items-stretch p-1 gap-1">
                  {/* Global playhead scrubber line */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-pink-500 shadow-md shadow-pink-500/50 z-20 pointer-events-none"
                    style={{
                      left: `${(globalTime / totalDuration) * 100}%`
                    }}
                  />

                  {clips.map((clip, index) => {
                    const clipWidth = ((clip.endTime - clip.startTime) / totalDuration) * 100
                    return (
                      <div
                        key={clip.id}
                        onClick={() => handleTimelineClipClick(clip.id)}
                        className={`relative rounded-lg overflow-hidden border cursor-pointer select-none flex-1 flex flex-col justify-between p-2 group transition-all duration-200 ${
                          selectedClipId === clip.id 
                            ? 'border-purple-500 bg-purple-950/20 shadow-lg shadow-purple-500/10' 
                            : 'border-slate-800 bg-slate-900/30 hover:border-slate-700'
                        }`}
                        style={{ width: `${clipWidth}%` }}
                      >
                        <div className="flex justify-between items-start gap-1 z-10">
                          <span className="text-[10px] font-medium text-slate-300 truncate max-w-[80px]">
                            {clip.name}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {((clip.endTime - clip.startTime)).toFixed(1)}s
                          </span>
                        </div>

                        {/* Order controls */}
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              moveClip(index, 'left')
                            }}
                            className="bg-slate-950 hover:bg-purple-900 rounded p-0.5 text-slate-400 hover:text-white"
                          >
                            <ArrowDown className="h-3 w-3 rotate-90" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              moveClip(index, 'right')
                            }}
                            className="bg-slate-950 hover:bg-purple-900 rounded p-0.5 text-slate-400 hover:text-white"
                          >
                            <ArrowUp className="h-3 w-3 rotate-90" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setClips(prev => prev.filter(c => c.id !== clip.id))
                              if (selectedClipId === clip.id) setSelectedClipId(null)
                            }}
                            className="bg-slate-950 hover:bg-red-900 rounded p-0.5 text-slate-400 hover:text-red-300"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Columns: Control Sidebar Panel */}
        <div className="flex flex-col gap-6">
          {clips.length > 0 && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm flex-1 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                {/* Navigation Tabs */}
                <div className="grid grid-cols-6 gap-1 rounded-xl bg-slate-950 p-1 border border-slate-900">
                  <button
                    onClick={() => setActiveTab('clips')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors ${
                      activeTab === 'clips' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Scissors className="h-4 w-4" />
                    <span>Timeline</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ratio')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors ${
                      activeTab === 'ratio' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Maximize className="h-4 w-4" />
                    <span>Canvas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('filters')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors ${
                      activeTab === 'filters' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Sliders className="h-4 w-4" />
                    <span>Filters</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('text')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors ${
                      activeTab === 'text' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Type className="h-4 w-4" />
                    <span>Text</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('stickers')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors ${
                      activeTab === 'stickers' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span>Stickers</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] transition-colors ${
                      activeTab === 'ai' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                    <span>AI Tools</span>
                  </button>
                </div>

                {/* Tab content panels */}
                <div className="space-y-4">
                  {/* Clips Trim settings */}
                  {activeTab === 'clips' && selectedClipId && (() => {
                    const clip = clips.find(c => c.id === selectedClipId)
                    if (!clip) return null

                    return (
                      <div className="space-y-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Clip Trimming</h4>
                        
                        <div className="space-y-3 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Name</span>
                            <span className="text-slate-300 truncate max-w-[120px] font-mono">{clip.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Total Duration</span>
                            <span className="text-slate-300 font-mono">{clip.duration.toFixed(2)}s</span>
                          </div>
                        </div>

                        {/* Individual clip trimmer inputs */}
                        <div className="space-y-3 pt-2">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 block">Start Seek Offset</label>
                            <input
                              type="range" min={0} max={clip.duration} step={0.01} value={clip.startTime}
                              onChange={(e) => {
                                const newStart = Math.min(parseFloat(e.target.value), clip.endTime - 0.1)
                                updateSelectedClip(c => ({ startTime: newStart }))
                              }}
                              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                              <span>0s</span>
                              <span>{clip.startTime.toFixed(2)}s</span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 block">End Seek Offset</label>
                            <input
                              type="range" min={0} max={clip.duration} step={0.01} value={clip.endTime}
                              onChange={(e) => {
                                const newEnd = Math.max(parseFloat(e.target.value), clip.startTime + 0.1)
                                updateSelectedClip(c => ({ endTime: newEnd }))
                              }}
                              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                              <span>{clip.endTime.toFixed(2)}s</span>
                              <span>{clip.duration.toFixed(2)}s</span>
                            </div>
                          </div>
                        </div>

                        {/* Speed adjustment */}
                        <div className="space-y-2 pt-2 border-t border-slate-900/50">
                          <label className="text-[10px] uppercase text-slate-500 block">Clip Playback Speed</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[0.5, 1.0, 1.5, 2.0].map((s) => (
                              <button
                                key={s}
                                onClick={() => updateSelectedClip(() => ({ playbackSpeed: s }))}
                                className={`rounded py-1.5 text-xs font-mono font-semibold transition-all ${
                                  clip.playbackSpeed === s
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-950 text-slate-400 hover:text-slate-300'
                                }`}
                              >
                                {s}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Canvas properties Tab */}
                  {activeTab === 'ratio' && (
                    <div className="space-y-5">
                      {/* Aspect Ratio selection */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Canvas Ratio</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                            <button
                              key={ratio}
                              onClick={() => setAspectRatio(ratio)}
                              className={`rounded-lg border py-2 text-[11px] font-semibold transition-all ${
                                aspectRatio === ratio
                                  ? 'border-purple-600 bg-purple-600/10 text-purple-400'
                                  : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              {ratio === '16:9' ? '16:9' : ratio === '9:16' ? '9:16 (TikTok)' : '1:1 (Square)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Canvas Color background */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Background Color</h4>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={canvasBgColor}
                            onChange={(e) => setCanvasBgColor(e.target.value)}
                            className="h-8 w-12 rounded border border-slate-800 bg-transparent cursor-pointer"
                          />
                          <span className="text-xs font-mono text-slate-400">{canvasBgColor}</span>
                        </div>
                      </div>

                      {/* Background Image upload */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Background Image</h4>
                        <div className="flex gap-2">
                          <button
                            onClick={() => bgImageInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-white"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Upload Image</span>
                          </button>
                          {bgImageUrl && (
                            <button
                              onClick={() => setBgImageUrl('')}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          ref={bgImageInputRef}
                          onChange={handleBackgroundUpload}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                    </div>
                  )}

                  {/* Filters Tab & Chroma Key */}
                  {activeTab === 'filters' && selectedClipId && (() => {
                    const clip = clips.find(c => c.id === selectedClipId)
                    if (!clip) return null

                    return (
                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Color adjustments</h4>
                          <button
                            onClick={() => {
                              updateSelectedClip(() => ({
                                brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0, hueRotate: 0
                              }))
                            }}
                            className="text-[10px] text-slate-500 hover:text-purple-400"
                          >
                            Reset Adjust
                          </button>
                        </div>

                        {/* Sliders */}
                        <div className="space-y-3.5 text-xs text-slate-400">
                          <div className="space-y-1">
                            <div className="flex justify-between"><span>Brightness</span><span>{clip.brightness}%</span></div>
                            <input type="range" min={0} max={200} value={clip.brightness} onChange={(e) => updateSelectedClip(() => ({ brightness: parseInt(e.target.value) }))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between"><span>Contrast</span><span>{clip.contrast}%</span></div>
                            <input type="range" min={0} max={200} value={clip.contrast} onChange={(e) => updateSelectedClip(() => ({ contrast: parseInt(e.target.value) }))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between"><span>Saturation</span><span>{clip.saturate}%</span></div>
                            <input type="range" min={0} max={200} value={clip.saturate} onChange={(e) => updateSelectedClip(() => ({ saturate: parseInt(e.target.value) }))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between"><span>Blur</span><span>{clip.blur}px</span></div>
                            <input type="range" min={0} max={10} value={clip.blur} onChange={(e) => updateSelectedClip(() => ({ blur: parseInt(e.target.value) }))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between"><span>Grayscale</span><span>{clip.grayscale}%</span></div>
                            <input type="range" min={0} max={100} value={clip.grayscale} onChange={(e) => updateSelectedClip(() => ({ grayscale: parseInt(e.target.value) }))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                          </div>
                        </div>

                        {/* Chroma Key / Green Screen Removal */}
                        <div className="pt-4 border-t border-slate-900 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Chroma Key (Green Screen)</h4>
                            <input
                              type="checkbox"
                              checked={clip.chromaKeyEnabled}
                              onChange={(e) => updateSelectedClip(() => ({ chromaKeyEnabled: e.target.checked }))}
                              className="h-4 w-4 rounded border-slate-800 text-purple-600 bg-slate-950 focus:ring-0"
                            />
                          </div>

                          {clip.chromaKeyEnabled && (
                            <div className="space-y-3 bg-slate-950/30 p-3 rounded-lg border border-slate-900 text-xs">
                              {/* Color picker */}
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Key Color</span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={clip.chromaKeyColor}
                                    onChange={(e) => updateSelectedClip(() => ({ chromaKeyColor: e.target.value }))}
                                    className="h-6 w-10 border border-slate-800 bg-transparent rounded cursor-pointer"
                                  />
                                  <span className="font-mono text-[10px] text-slate-400">{clip.chromaKeyColor}</span>
                                </div>
                              </div>

                              {/* Threshold slider */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-slate-500">
                                  <span>Sensitivity Threshold</span>
                                  <span className="font-mono">{clip.chromaKeyThreshold}</span>
                                </div>
                                <input
                                  type="range" min={10} max={120} value={clip.chromaKeyThreshold}
                                  onChange={(e) => updateSelectedClip(() => ({ chromaKeyThreshold: parseInt(e.target.value) }))}
                                  className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Text Overlays Tab */}
                  {activeTab === 'text' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Text layers</h4>
                        <button
                          onClick={handleTextLayerAdd}
                          className="flex items-center gap-1 text-[10px] text-purple-400 font-semibold"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add New</span>
                        </button>
                      </div>

                      {/* Text Layers list */}
                      <div className="space-y-2 max-h-[140px] overflow-y-auto">
                        {textLayers.length === 0 ? (
                          <p className="text-xs text-slate-600 italic">No text overlays added yet.</p>
                        ) : (
                          textLayers.map((layer) => (
                            <div 
                              key={layer.id}
                              onClick={() => setSelectedTextId(layer.id)}
                              className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                selectedTextId === layer.id 
                                  ? 'bg-purple-950/20 border-purple-500/50 text-white' 
                                  : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <span className="truncate max-w-[120px] font-medium">{layer.text}</span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTextLayer(layer.id)
                                }}
                                className="text-slate-500 hover:text-red-400 p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Editing active layer properties */}
                      {selectedTextId && (() => {
                        const layer = textLayers.find(t => t.id === selectedTextId)
                        if (!layer) return null

                        return (
                          <div className="rounded-xl border border-slate-800/80 bg-slate-900/10 p-3 space-y-3 text-xs">
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase text-slate-500">Edit Text</label>
                              <input
                                type="text"
                                value={layer.text}
                                onChange={(e) => handleUpdateTextValue(layer.id, e.target.value)}
                                className="w-full rounded-lg bg-slate-950 border border-slate-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] uppercase text-slate-500">
                                <span>Font Size</span>
                                <span className="font-mono text-slate-300">{layer.fontSize}px</span>
                              </div>
                              <input
                                type="range" min={12} max={72} value={layer.fontSize}
                                onChange={(e) => handleUpdateTextSize(layer.id, parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] uppercase text-slate-500 block mb-1">Color</label>
                              <div className="flex flex-wrap gap-1">
                                {colors.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() => handleUpdateTextColor(layer.id, color)}
                                    className={`h-5 w-5 rounded-full border ${
                                      layer.color === color ? 'border-white scale-110' : 'border-transparent'
                                    }`}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Stickers & Background music Tab */}
                  {activeTab === 'stickers' && (
                    <div className="space-y-5">
                      {/* Image layers list */}
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Stickers & Graphics</h4>
                          <button
                            onClick={() => stickerInputRef.current?.click()}
                            className="flex items-center gap-1 text-[10px] text-purple-400 font-semibold"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add Sticker</span>
                          </button>
                        </div>
                        <input
                          type="file"
                          ref={stickerInputRef}
                          onChange={handleStickerUpload}
                          accept="image/*"
                          className="hidden"
                        />

                        {/* List */}
                        <div className="space-y-2 max-h-[140px] overflow-y-auto">
                          {imageLayers.length === 0 ? (
                            <p className="text-xs text-slate-600 italic">No stickers added yet.</p>
                          ) : (
                            imageLayers.map((layer) => (
                              <div 
                                key={layer.id}
                                onClick={() => setSelectedImageId(layer.id)}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                  selectedImageId === layer.id 
                                    ? 'bg-purple-950/20 border-purple-500/50 text-white' 
                                    : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 max-w-[120px]">
                                  <img src={layer.url} alt={layer.name} className="h-6 w-6 object-contain rounded" />
                                  <span className="truncate text-slate-300 font-medium">{layer.name}</span>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteSticker(layer.id)
                                  }}
                                  className="text-slate-500 hover:text-red-400 p-1"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Adjust Scale of selected image */}
                        {selectedImageId && (() => {
                          const layer = imageLayers.find(i => i.id === selectedImageId)
                          if (!layer) return null

                          return (
                            <div className="rounded-xl border border-slate-800 bg-slate-900/10 p-3 space-y-2 text-xs">
                              <div className="flex justify-between text-[10px] uppercase text-slate-500">
                                <span>Sticker Size</span>
                                <span className="font-mono text-slate-300">{layer.scale}%</span>
                              </div>
                              <input
                                type="range" min={5} max={100} value={layer.scale}
                                onChange={(e) => {
                                  const scale = parseInt(e.target.value)
                                  setImageLayers(prev => prev.map(img => img.id === selectedImageId ? { ...img, scale } : img))
                                }}
                                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                              />
                            </div>
                          )
                        })()}
                      </div>

                      {/* Background Music mixer */}
                      <div className="pt-4 border-t border-slate-900 space-y-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Background Music Track</h4>
                        <div className="flex gap-2">
                          <button
                            onClick={() => musicInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-white"
                          >
                            <Music className="h-3.5 w-3.5 text-purple-400" />
                            <span>Choose Audio file</span>
                          </button>
                          {musicUrl && (
                            <button
                              onClick={() => {
                                setMusicFile(null)
                                setMusicUrl('')
                              }}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          type="file"
                          ref={musicInputRef}
                          onChange={handleMusicUpload}
                          accept="audio/*"
                          className="hidden"
                        />

                        {musicUrl && (
                          <div className="space-y-3 bg-slate-950/20 p-3 border border-slate-900 rounded-lg text-xs text-slate-400">
                            <p className="truncate text-slate-300 font-mono text-[10px]" title={musicFile?.name}>
                              {musicFile?.name}
                            </p>
                            
                            {/* Volumes mixers */}
                            <div className="space-y-2 pt-1 border-t border-slate-900/50">
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>Music Volume</span><span>{Math.round(musicVolume * 100)}%</span></div>
                                <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(e) => setMusicVolume(parseFloat(e.target.value))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between"><span>Original Video Audio</span><span>{Math.round(videoVolume * 100)}%</span></div>
                                <input type="range" min={0} max={1} step={0.05} value={videoVolume} onChange={(e) => setVideoVolume(parseFloat(e.target.value))} className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AI Tools Tab */}
                  {activeTab === 'ai' && (
                    <div className="space-y-6 max-h-[500px] overflow-y-auto pr-1">
                      
                      {/* Section 1: Webcam Puppeteer Character Clone */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Mic className="h-3.5 w-3.5 text-purple-400" />
                          AI Visual Character Clone
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Puppeteer an AI character with your camera. Tilt your head, blink, and speak.
                        </p>

                        <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-3.5 space-y-3">
                          {/* Character Select */}
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase text-slate-500 font-semibold block">Select Character</label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(['robot', 'kitty', 'demon'] as const).map((avatar) => (
                                <button
                                  key={avatar}
                                  onClick={() => setSelectedAvatar(avatar)}
                                  className={`rounded py-1.5 text-xs font-semibold uppercase transition-all cursor-pointer ${
                                    selectedAvatar === avatar
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {avatar}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Canvas Preview */}
                          <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-slate-900 bg-slate-950 flex items-center justify-center">
                            <canvas
                              ref={avatarCanvasRef}
                              className="w-full h-full object-contain"
                            />
                            {!isWebcamActive && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/80 text-center gap-2">
                                <Brain className="h-8 w-8 text-purple-500 animate-pulse" />
                                <span className="text-[11px] text-slate-400">Webcam tracking is off</span>
                              </div>
                            )}
                          </div>

                          {/* Control Buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={toggleWebcam}
                              className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition-all cursor-pointer ${
                                isWebcamActive
                                  ? 'bg-slate-900 border-slate-800 text-red-400 hover:text-red-300'
                                  : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'
                              }`}
                            >
                              {isWebcamActive ? 'Stop Webcam' : 'Start Webcam'}
                            </button>

                            {isWebcamActive && (
                              <button
                                onClick={toggleAvatarRecording}
                                className={`flex-1 rounded-lg py-2 text-xs font-semibold border transition-all cursor-pointer ${
                                  isRecordingAvatar
                                    ? 'bg-red-600 border-red-500 text-white animate-pulse'
                                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                                }`}
                              >
                                {isRecordingAvatar ? `Stop (${avatarRecordingDuration}s)` : 'Record Puppet'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Auto Transcriptions & Captions */}
                      <div className="pt-4 border-t border-slate-900/50 space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Brain className="h-3.5 w-3.5 text-purple-400" />
                          Auto Captions & Transcription
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Extract speech from the selected clip and place yellow timed captions on the screen.
                        </p>
                        
                        {selectedClipId ? (
                          <div className="space-y-3">
                            {isTranscribing ? (
                              <div className="space-y-2 bg-slate-950/30 border border-slate-900 rounded-lg p-3">
                                <div className="flex justify-between text-[10px] font-mono text-purple-400">
                                  <span className="truncate max-w-[170px]">{transcriptionStatusText}</span>
                                  <span>{transcriptionProgress}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                                  <div 
                                    className="h-full bg-purple-600 transition-all duration-300"
                                    style={{ width: `${transcriptionProgress}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={handleAutoTranscribeClip}
                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 py-2.5 text-xs font-semibold text-white transition-all shadow-md shadow-purple-500/10 cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Generate Auto Captions
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600 italic">Select a clip on the timeline first.</p>
                        )}
                      </div>

                      {/* Section 3: Filler word cutter */}
                      {selectedClipId && (() => {
                        const clip = clips.find(c => c.id === selectedClipId)
                        if (!clip) return null
                        
                        return (
                          <div className="pt-4 border-t border-slate-900/50 space-y-3">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                              <Scissors className="h-3.5 w-3.5 text-purple-400" />
                              Remove Verbal Garbage
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Detect and trim out spoken filler words (like "um", "uh", "ah", "like", "err") to clean up your audio automatically.
                            </p>

                            {clip.transcription ? (
                              <button
                                onClick={handleTrimFillerWords}
                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-pink-600 hover:bg-pink-500 py-2.5 text-xs font-semibold text-white transition-all shadow-md shadow-pink-500/10 cursor-pointer"
                              >
                                <Scissors className="h-3.5 w-3.5" />
                                Cut Verbal Fillers
                              </button>
                            ) : (
                              <div className="rounded-lg border border-slate-900 bg-slate-950/20 p-3 text-[11px] text-slate-500 italic">
                                Run "Generate Auto Captions" above first to enable filler removal on this clip.
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Section 4: TTS & Voice Cloning */}
                      <div className="pt-4 border-t border-slate-900/50 space-y-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Mic className="h-3.5 w-3.5 text-purple-400" />
                          Voice Cloning & TTS
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Create a custom voiceover. Record a 3-second sample of your voice to clone its pitch and timbre characteristics.
                        </p>

                        {/* Mic Recorder */}
                        <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-medium">Voice Signature</span>
                            {userVoicePitch ? (
                              <span className="text-[10px] bg-green-500/10 border border-green-500/20 text-green-400 rounded px-1.5 py-0.5 font-mono">
                                Cloned ({userVoicePitch} Hz)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 italic">No signature recorded</span>
                            )}
                          </div>

                          <button
                            onClick={toggleVoiceRecording}
                            className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all border cursor-pointer ${
                              isRecordingVoice
                                ? 'bg-red-600 border-red-500 text-white animate-pulse'
                                : voiceSignatureBuffer
                                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                                : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'
                            }`}
                          >
                            <Mic className="h-3.5 w-3.5" />
                            {isRecordingVoice 
                              ? 'Recording... Speak now!' 
                              : voiceSignatureBuffer 
                              ? 'Record Voice Signature again (3s)' 
                              : 'Record Voice Signature (3s)'
                            }
                          </button>
                        </div>

                        {/* TTS Generator */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 font-semibold block">Base Synthetic Voice</label>
                            <select
                              value={selectedBaseVoice}
                              onChange={(e) => setSelectedBaseVoice(e.target.value)}
                              className="w-full rounded-lg bg-slate-950 border border-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                            >
                              <option value="Brian">Brian (Polly UK Male - Recommended)</option>
                              <option value="Amy">Amy (Polly UK Female)</option>
                              <option value="Emma">Emma (UK Female)</option>
                              <option value="Joey">Joey (Polly US Male)</option>
                              <option value="Kendra">Kendra (Polly US Female)</option>
                              <option value="Salli">Salli (Polly US Female)</option>
                              <option value="Ivy">Ivy (US Child Female)</option>
                              <option value="Justin">Justin (US Child Male)</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 font-semibold block">Voiceover Text</label>
                            <textarea
                              value={ttsText}
                              onChange={(e) => setTtsText(e.target.value)}
                              placeholder="Type something for the synthetic voice to speak..."
                              className="w-full h-16 rounded-lg bg-slate-950 border border-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                            />
                          </div>

                          <button
                            onClick={handleGenerateTtsVoiceover}
                            disabled={isGeneratingTts || !ttsText.trim()}
                            className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 py-3 text-xs font-bold text-white transition-all shadow-md shadow-purple-500/10 disabled:opacity-50 cursor-pointer"
                          >
                            {isGeneratingTts ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                <span>Generating Voiceover...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>{voiceSignatureBuffer ? 'Generate Cloned Voiceover' : 'Generate TTS Voiceover'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div className="space-y-4 pt-6 border-t border-slate-900">
                {isExporting ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-purple-400 flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Exporting selection...
                      </span>
                      <span className="font-mono">{exportProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all duration-100"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  </div>
                ) : exportedUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-green-400">Video successfully generated!</h4>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Your custom edited clip is ready for download.
                        </p>
                      </div>
                    </div>

                    <a
                      href={exportedUrl}
                      download={`opencut_edit_${Date.now()}.webm`}
                      className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-green-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-600/15 hover:bg-green-500 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download Video
                    </a>

                    <button
                      onClick={() => setExportedUrl('')}
                      className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-2.5 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Clear Export
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exportError && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
                        {exportError}
                      </div>
                    )}
                    
                    <button
                      onClick={handleExport}
                      className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/15 hover:opacity-90 active:scale-[0.99] transition-all"
                    >
                      <Scissors className="h-4 w-4" />
                      Export Edited Video
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick instructions if empty */}
          {clips.length === 0 && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm space-y-4">
              <div className="flex gap-3">
                <Sliders className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">How to use OpenCut Studio:</h4>
                  <ul className="mt-3 space-y-2.5 text-[11px] text-slate-400 list-decimal pl-4">
                    <li>Click <strong>Add Clips</strong> in the header to load one or more video files.</li>
                    <li>Arrange clips on the timeline using the order controls and trim individual files.</li>
                    <li>Move the playhead and click <strong>Split Clip</strong> to cut clips.</li>
                    <li>Apply filters, chroma key green screens, text, background music, or stickers.</li>
                    <li>Position and drag elements directly on the video player.</li>
                    <li>Click <strong>Export Edited Video</strong> to compile and download!</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
