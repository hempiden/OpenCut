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
  RotateCcw
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: Home })

interface TextLayer {
  id: string
  text: string
  color: string
  fontSize: number
  x: number // percentage (0 - 100)
  y: number // percentage (0 - 100)
}

function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportedUrl, setExportedUrl] = useState<string>('')
  const [exportError, setExportError] = useState<string>('')

  // Editing Sidebar Tab
  const [activeTab, setActiveTab] = useState<'trim' | 'ratio' | 'filters' | 'text'>('trim')

  // Aspect Ratio & Speed
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9')
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)

  // Filters state
  const [brightness, setBrightness] = useState<number>(100)
  const [contrast, setContrast] = useState<number>(100)
  const [saturate, setSaturate] = useState<number>(100)
  const [blur, setBlur] = useState<number>(0)
  const [grayscale, setGrayscale] = useState<number>(0)
  const [sepia, setSepia] = useState<number>(0)
  const [hueRotate, setHueRotate] = useState<number>(0)

  // Text layers state
  const [textLayers, setTextLayers] = useState<TextLayer[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // Cleanup object URLs on unmount/change
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      if (exportedUrl) URL.revokeObjectURL(exportedUrl)
    }
  }, [videoUrl, exportedUrl])

  // Monitor playback within selection range
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (isPlaying && video.currentTime >= endTime) {
        video.currentTime = startTime
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [isPlaying, startTime, endTime])

  // Track progress on frame requests
  const updateProgress = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
      if (isPlaying) {
        requestRef.current = requestAnimationFrame(updateProgress)
      }
    }
  }

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(updateProgress)
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current)
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [isPlaying])

  // Update speed locally when changed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed, videoUrl])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setVideoFile(file)
      const url = URL.createObjectURL(file)
      setVideoUrl(url)
      setIsPlaying(false)
      setExportedUrl('')
      setExportError('')
      setStartTime(0)
      setDuration(0)
      setCurrentTime(0)
      setTextLayers([])
      setSelectedTextId(null)
      handleResetFilters()
      setAspectRatio('16:9')
      setPlaybackSpeed(1)
    }
  }

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current
    if (video) {
      setDuration(video.duration)
      setEndTime(video.duration)
    }
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      if (video.currentTime >= endTime || video.currentTime < startTime) {
        video.currentTime = startTime
      }
      video.play().then(() => {
        setIsPlaying(true)
      }).catch(err => console.error("Playback error:", err))
    }
  }

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const value = parseFloat(e.target.value)
    const video = videoRef.current
    if (!video) return

    if (type === 'start') {
      const newStart = Math.min(value, endTime - 0.1)
      setStartTime(newStart)
      video.currentTime = newStart
      setCurrentTime(newStart)
    } else {
      const newEnd = Math.max(value, startTime + 0.1)
      setEndTime(newEnd)
      video.currentTime = newEnd
      setCurrentTime(newEnd)
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (video) {
      video.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleResetTrim = () => {
    setStartTime(0)
    setEndTime(duration)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
    }
  }

  const handleResetFilters = () => {
    setBrightness(100)
    setContrast(100)
    setSaturate(100)
    setBlur(0)
    setGrayscale(0)
    setSepia(0)
    setHueRotate(0)
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  // Draggable Text Logic using Pointer Events
  const handleTextPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    setSelectedTextId(id)
    const layer = textLayers.find(t => t.id === id)
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

      setTextLayers(prev => prev.map(t => {
        if (t.id === id) {
          return {
            ...t,
            x: Math.max(0, Math.min(100, startXPercent + dxPercent)),
            y: Math.max(0, Math.min(100, startYPercent + dyPercent))
          }
        }
        return t
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

  const handleAddTextLayer = () => {
    const newLayer: TextLayer = {
      id: `text-${Date.now()}`,
      text: 'Add Text Here',
      color: '#ffffff',
      fontSize: 24,
      x: 50, // center
      y: 50  // center
    }
    setTextLayers(prev => [...prev, newLayer])
    setSelectedTextId(newLayer.id)
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

  // Get Aspect Ratio values
  const getAspectMultiplier = (ratio: '16:9' | '9:16' | '1:1') => {
    if (ratio === '9:16') return 9 / 16
    if (ratio === '1:1') return 1
    return 16 / 9
  }

  // CSS Filter string calculation
  const getFilterString = () => {
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blur}px) grayscale(${grayscale}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg)`
  }

  // Canvas-based Export Engine: Bakes Filters, Text overlays, and Crops/Aspect Ratio
  const handleExport = async () => {
    const video = videoRef.current
    if (!video || !videoFile) return

    setIsExporting(true)
    setExportProgress(0)
    setExportedUrl('')
    setExportError('')
    recordedChunksRef.current = []

    try {
      video.pause()
      setIsPlaying(false)
      video.currentTime = startTime

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
      })

      // Set up canvas sizes
      const canvas = document.createElement('canvas')
      const targetHeight = video.videoHeight || 720
      const targetAspect = getAspectMultiplier(aspectRatio)
      const targetWidth = targetHeight * targetAspect

      canvas.height = targetHeight
      canvas.width = targetWidth

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not create canvas context.')

      // Math for Center Cropping/Scaling
      const videoWidth = video.videoWidth
      const videoHeight = video.videoHeight
      const videoAspect = videoWidth / videoHeight

      let sx = 0, sy = 0, sw = videoWidth, sh = videoHeight

      if (videoAspect > targetAspect) {
        sw = videoHeight * targetAspect
        sx = (videoWidth - sw) / 2
      } else if (videoAspect < targetAspect) {
        sh = videoWidth / targetAspect
        sy = (videoHeight - sh) / 2
      }

      // Read video container size for scaling texts
      const videoContainer = video.parentElement
      const previewHeight = videoContainer?.clientHeight || video.clientHeight || 1

      // Capture Canvas Stream (30 FPS)
      const canvasStream = canvas.captureStream(30)

      // Audio Capture
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const dest = audioContext.createMediaStreamDestination()
      const source = audioContext.createMediaElementSource(video)
      source.connect(dest)
      source.connect(audioContext.destination)

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
        audioContext.close()
      }

      // Start Recording
      recorder.start()
      video.play()

      const filterString = getFilterString()
      const exportDuration = endTime - startTime

      // Animation Frame drawing loop
      let animationFrameId: number
      const drawFrame = () => {
        if (!video || recorder.state === 'inactive') return

        if (video.currentTime >= endTime) {
          video.pause()
          recorder.stop()
          return
        }

        // Draw video with filters
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.filter = filterString
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        ctx.filter = 'none'

        // Draw text overlays
        textLayers.forEach(layer => {
          const xPos = (layer.x / 100) * canvas.width
          const yPos = (layer.y / 100) * canvas.height
          const scaledFontSize = layer.fontSize * (canvas.height / previewHeight)

          ctx.font = `bold ${scaledFontSize}px sans-serif`
          ctx.fillStyle = layer.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(layer.text, xPos, yPos)
        })

        // Track progress percentage
        const elapsed = video.currentTime - startTime
        const progress = Math.min(Math.round((elapsed / exportDuration) * 100), 99)
        setExportProgress(progress)

        animationFrameId = requestAnimationFrame(drawFrame)
      }

      // Run Frame Loop
      drawFrame()

    } catch (err: any) {
      console.error(err)
      setExportError(err.message || 'Failed to export video.')
      setIsExporting(false)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    const centiseconds = Math.floor((time % 1) * 100)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }

  // Predefined color presets
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
              Advanced Client-Side Editor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {videoUrl && (
            <button
              onClick={handleAddTextLayer}
              className="flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-purple-400 hover:text-white transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Text Overlay
            </button>
          )}
          <div className="hidden items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-xs text-slate-400 md:flex">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span>100% Private, Local browser processing</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        {/* Left Columns: Preview & Timeline */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Player Container */}
          <div className="flex-1 min-h-[400px] flex items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/10 backdrop-blur-sm relative overflow-hidden shadow-inner p-4">
            {videoUrl ? (
              <div 
                className={`relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center transition-all duration-300 ${
                  aspectRatio === '16:9' ? 'w-full max-w-[700px] aspect-video' :
                  aspectRatio === '9:16' ? 'h-[500px] aspect-[9/16]' :
                  'h-[500px] aspect-square'
                }`}
              >
                {/* Video Player */}
                <video
                  ref={videoRef}
                  src={videoUrl}
                  style={{ filter: getFilterString() }}
                  className="w-full h-full object-cover rounded-2xl"
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onClick={togglePlay}
                />

                {/* Draggable Text Overlays */}
                <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
                  {textLayers.map((layer) => (
                    <div
                      key={layer.id}
                      onPointerDown={(e) => handleTextPointerDown(e, layer.id)}
                      className={`absolute pointer-events-auto select-none cursor-move px-3 py-1.5 rounded-lg border font-sans font-bold select-none text-center transform -translate-x-1/2 -translate-y-1/2 transition-shadow ${
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
                </div>
              </div>
            ) : (
              <div 
                className="flex flex-col items-center justify-center text-center p-8 cursor-pointer hover:bg-slate-900/40 transition-colors w-full h-full rounded-2xl border-2 border-dashed border-slate-800 hover:border-purple-500/50"
                onClick={triggerFileInput}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
                  <Film className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-200">Load your video file</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-xs">
                  Drag & drop or browse your local files. MP4, WebM, and other formats supported.
                </p>
                <button className="mt-6 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/20">
                  Browse Files
                </button>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              className="hidden"
            />
          </div>

          {/* Timeline & Playback Panel */}
          {videoUrl && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm space-y-6">
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
                    onClick={handleResetTrim}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white transition-colors"
                    title="Reset Trim"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-6 text-sm text-slate-400 font-mono">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 uppercase">Current Time</span>
                    <span className="text-white font-semibold">{formatTime(currentTime)}</span>
                  </div>
                  <div className="h-8 w-px bg-slate-800"></div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 uppercase">Duration Selection</span>
                    <span className="text-purple-400 font-semibold">{formatTime(endTime - startTime)}</span>
                  </div>
                </div>
              </div>

              {/* Sliders Range Bar */}
              <div className="space-y-4 pt-2">
                <div className="relative h-12 bg-slate-950 border border-slate-900 rounded-xl overflow-hidden px-4 flex items-center">
                  <div 
                    className="absolute top-0 bottom-0 bg-purple-500/10 border-l border-r border-purple-500/50"
                    style={{
                      left: `${(startTime / duration) * 100}%`,
                      right: `${100 - (endTime / duration) * 100}%`
                    }}
                  />
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-pink-500 shadow-md shadow-pink-500/50 z-10 pointer-events-none"
                    style={{
                      left: `${(currentTime / duration) * 100}%`
                    }}
                  />

                  <div className="w-full relative h-2">
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.01}
                      value={startTime}
                      onChange={(e) => handleTimelineChange(e, 'start')}
                      className="absolute w-full top-0 bottom-0 appearance-none bg-transparent pointer-events-none z-20 cursor-pointer [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:shadow-lg"
                    />
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.01}
                      value={endTime}
                      onChange={(e) => handleTimelineChange(e, 'end')}
                      className="absolute w-full top-0 bottom-0 appearance-none bg-transparent pointer-events-none z-20 cursor-pointer [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Start: {formatTime(startTime)}</span>
                  <span>End: {formatTime(endTime)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Columns: Control Sidebar Panel */}
        <div className="flex flex-col gap-6">
          {videoUrl && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm flex-1 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                {/* Navigation Tabs */}
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-950 p-1 border border-slate-900">
                  <button
                    onClick={() => setActiveTab('trim')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                      activeTab === 'trim' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Scissors className="h-4 w-4" />
                    <span>Cut</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ratio')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                      activeTab === 'ratio' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Maximize className="h-4 w-4" />
                    <span>Ratio</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('filters')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                      activeTab === 'filters' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Sliders className="h-4 w-4" />
                    <span>Filters</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('text')}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                      activeTab === 'text' ? 'bg-slate-900 text-purple-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Type className="h-4 w-4" />
                    <span>Text</span>
                  </button>
                </div>

                {/* Tab Content Panels */}
                <div className="space-y-4">
                  {/* Trim Panel */}
                  {activeTab === 'trim' && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Duration Settings</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                          <span className="text-slate-500">File Name</span>
                          <span className="text-slate-300 truncate max-w-[150px] font-mono text-xs" title={videoFile?.name}>
                            {videoFile?.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                          <span className="text-slate-500">Input Size</span>
                          <span className="text-slate-300 font-mono text-xs">
                            {videoFile ? (videoFile.size / (1024 * 1024)).toFixed(2) : 0} MB
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                          <span className="text-slate-500">Trimming Length</span>
                          <span className="text-purple-400 font-mono text-xs font-semibold">
                            {formatTime(endTime - startTime)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ratio & Speed Panel */}
                  {activeTab === 'ratio' && (
                    <div className="space-y-5">
                      {/* Aspect Ratio */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Canvas Ratio</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                            <button
                              key={ratio}
                              onClick={() => setAspectRatio(ratio)}
                              className={`rounded-lg border py-2.5 text-xs font-semibold transition-all ${
                                aspectRatio === ratio
                                  ? 'border-purple-600 bg-purple-600/10 text-purple-400'
                                  : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              {ratio === '16:9' ? '16:9 (Landscape)' : ratio === '9:16' ? '9:16 (Vertical)' : '1:1 (Square)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Playback Speed */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Playback Speed</h4>
                        <div className="grid grid-cols-4 gap-2">
                          {[0.5, 1.0, 1.5, 2.0].map((speed) => (
                            <button
                              key={speed}
                              onClick={() => setPlaybackSpeed(speed)}
                              className={`rounded-lg border py-2 text-xs font-mono font-semibold transition-all ${
                                playbackSpeed === speed
                                  ? 'border-purple-600 bg-purple-600/10 text-purple-400'
                                  : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-300'
                              }`}
                            >
                              {speed}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filters Panel */}
                  {activeTab === 'filters' && (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Color Filters</h4>
                        <button
                          onClick={handleResetFilters}
                          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-purple-400 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset</span>
                        </button>
                      </div>

                      {/* Brightness */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Brightness</span>
                          <span className="font-mono">{brightness}%</span>
                        </div>
                        <input
                          type="range" min={0} max={200} value={brightness}
                          onChange={(e) => setBrightness(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Contrast */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Contrast</span>
                          <span className="font-mono">{contrast}%</span>
                        </div>
                        <input
                          type="range" min={0} max={200} value={contrast}
                          onChange={(e) => setContrast(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Saturation */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Saturation</span>
                          <span className="font-mono">{saturate}%</span>
                        </div>
                        <input
                          type="range" min={0} max={200} value={saturate}
                          onChange={(e) => setSaturate(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Blur */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Blur</span>
                          <span className="font-mono">{blur}px</span>
                        </div>
                        <input
                          type="range" min={0} max={10} value={blur}
                          onChange={(e) => setBlur(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Grayscale */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Grayscale</span>
                          <span className="font-mono">{grayscale}%</span>
                        </div>
                        <input
                          type="range" min={0} max={100} value={grayscale}
                          onChange={(e) => setGrayscale(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Sepia */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Sepia</span>
                          <span className="font-mono">{sepia}%</span>
                        </div>
                        <input
                          type="range" min={0} max={100} value={sepia}
                          onChange={(e) => setSepia(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>

                      {/* Hue Rotate */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Hue Rotate</span>
                          <span className="font-mono">{hueRotate}°</span>
                        </div>
                        <input
                          type="range" min={0} max={360} value={hueRotate}
                          onChange={(e) => setHueRotate(parseInt(e.target.value))}
                          className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Text Overlay Panel */}
                  {activeTab === 'text' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Text Layers</h4>
                        <button
                          onClick={handleAddTextLayer}
                          className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add New</span>
                        </button>
                      </div>

                      {/* List of text layers */}
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

                      {/* Edit selected text properties */}
                      {selectedTextId && (() => {
                        const selectedLayer = textLayers.find(t => t.id === selectedTextId)
                        if (!selectedLayer) return null

                        return (
                          <div className="rounded-xl border border-slate-800/80 bg-slate-900/10 p-3 space-y-3">
                            {/* Text Input */}
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase text-slate-500">Edit Text</label>
                              <input
                                type="text"
                                value={selectedLayer.text}
                                onChange={(e) => handleUpdateTextValue(selectedLayer.id, e.target.value)}
                                className="w-full rounded-lg bg-slate-950 border border-slate-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                              />
                            </div>

                            {/* Font Size */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] uppercase text-slate-500">
                                <span>Font Size</span>
                                <span className="font-mono text-slate-300">{selectedLayer.fontSize}px</span>
                              </div>
                              <input
                                type="range" min={12} max={72} value={selectedLayer.fontSize}
                                onChange={(e) => handleUpdateTextSize(selectedLayer.id, parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                              />
                            </div>

                            {/* Color presets */}
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase text-slate-500 block mb-1">Color</label>
                              <div className="flex flex-wrap gap-1.5">
                                {colors.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() => handleUpdateTextColor(selectedLayer.id, color)}
                                    className={`h-5 w-5 rounded-full border transition-all ${
                                      selectedLayer.color === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'
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
          {!videoUrl && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm space-y-4">
              <div className="flex gap-3">
                <Sliders className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">How to use OpenCut Studio:</h4>
                  <ul className="mt-3 space-y-2.5 text-[11px] text-slate-400 list-decimal pl-4">
                    <li>Load any local video file (your video stays 100% private and never uploads to servers).</li>
                    <li>Drag the handles on the timeline to select your starting and ending points.</li>
                    <li>Use the tabs to apply filters, change aspect ratios, adjust speed, and add text overlays.</li>
                    <li>Drag text overlays directly on the video player to position them.</li>
                    <li>Click <strong>Export Edited Video</strong> to bake all your changes and download.</li>
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
