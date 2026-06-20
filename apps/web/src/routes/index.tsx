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
  Info, 
  Sparkles,
  ArrowRight,
  Split
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: Home })

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

  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  // Cleanup video URL when file changes
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
      if (exportedUrl) {
        URL.revokeObjectURL(exportedUrl)
      }
    }
  }, [videoUrl, exportedUrl])

  // Handle video playback loop within trim range
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      
      // If we are playing and reach the end of the trim range, loop back to start
      if (isPlaying && video.currentTime >= endTime) {
        video.currentTime = startTime
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [isPlaying, startTime, endTime])

  // Track progress when playing
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
      // If we're outside the trim range, seek back to start
      if (video.currentTime >= endTime || video.currentTime < startTime) {
        video.currentTime = startTime
      }
      video.play().then(() => {
        setIsPlaying(true)
      }).catch(err => console.error("Error playing video:", err))
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

  const handleReset = () => {
    setStartTime(0)
    setEndTime(duration)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  // Pure HTML5 client-side video trimming using Canvas and MediaRecorder
  const handleExport = async () => {
    const video = videoRef.current
    if (!video || !videoFile) return

    setIsExporting(true)
    setExportProgress(0)
    setExportedUrl('')
    setExportError('')
    recordedChunksRef.current = []

    try {
      // Seek to start time
      video.pause()
      setIsPlaying(false)
      video.currentTime = startTime

      // Wait for video to seek
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
      })

      // Capture stream from video element
      let stream: MediaStream
      const anyVideo = video as any
      if (anyVideo.captureStream) {
        stream = anyVideo.captureStream()
      } else if (anyVideo.mozCaptureStream) {
        stream = anyVideo.mozCaptureStream()
      } else {
        throw new Error('Your browser does not support client-side recording.')
      }

      // Check if we have audio track
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const dest = audioContext.createMediaStreamDestination()
      const source = audioContext.createMediaElementSource(video)
      source.connect(dest)
      source.connect(audioContext.destination) // Play audio to speakers too

      // Combine video stream with captured audio stream
      const combinedTracks = [
        ...stream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]
      const combinedStream = new MediaStream(combinedTracks)

      const options = { mimeType: 'video/webm;codecs=vp9,opus' }
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(combinedStream, options)
      } catch (e) {
        // Fallback for browsers that don't support VP9
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

      // Start recording
      recorder.start()
      video.play()

      // Track export duration and progress
      const exportDuration = endTime - startTime
      const checkInterval = setInterval(() => {
        if (!video || recorder.state === 'inactive') {
          clearInterval(checkInterval)
          return
        }

        const elapsed = video.currentTime - startTime
        const progress = Math.min(Math.round((elapsed / exportDuration) * 100), 99)
        setExportProgress(progress)

        // Stop recording when we reach end time
        if (video.currentTime >= endTime) {
          clearInterval(checkInterval)
          video.pause()
          recorder.stop()
        }
      }, 100)

    } catch (err: any) {
      console.error(err)
      setExportError(err.message || 'Failed to export video.')
      setIsExporting(false)
    }
  }

  // Format time in MM:SS.CC
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    const centiseconds = Math.floor((time % 1) * 100)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-600 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 shadow-lg shadow-purple-500/20">
            <Scissors className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              OpenCut Studio
            </h1>
            <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">
              Client-Side Trimmer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-xs text-slate-400 md:flex">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span>100% Private, Local browser processing</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        {/* Left 2 Columns: Video Player & Timeline */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Player Panel */}
          <div className="flex-1 min-h-[400px] flex items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/30 backdrop-blur-sm relative overflow-hidden shadow-inner group">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain max-h-[500px]"
                onLoadedMetadata={handleVideoLoadedMetadata}
                onClick={togglePlay}
              />
            ) : (
              <div 
                className="flex flex-col items-center justify-center text-center p-8 cursor-pointer hover:bg-slate-900/40 transition-colors w-full h-full rounded-2xl border-2 border-dashed border-slate-800 hover:border-purple-500/50"
                onClick={triggerFileInput}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 shadow-md group-hover:scale-105 transition-transform duration-300">
                  <Film className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-200">Load your video file</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-xs">
                  Drag & drop or browse your local files. MP4, WebM, and other formats supported.
                </p>
                <button className="mt-6 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/20 hover:opacity-90 transition-opacity">
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
              {/* Playback Controls & Time Display */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlay}
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600 text-white shadow-lg shadow-purple-600/10 hover:bg-purple-500 active:scale-95 transition-all"
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
                    onClick={handleReset}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white transition-colors"
                    title="Reset Trim Points"
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
                    <span className="text-[10px] text-slate-500 uppercase">Selection Range</span>
                    <span className="text-purple-400 font-semibold">{formatTime(endTime - startTime)}</span>
                  </div>
                </div>
              </div>

              {/* Range Trimmer sliders */}
              <div className="space-y-4 pt-2">
                <div className="relative h-12 bg-slate-950 border border-slate-900 rounded-xl overflow-hidden px-4 flex items-center">
                  {/* Visual selection representation */}
                  <div 
                    className="absolute top-0 bottom-0 bg-purple-500/10 border-l border-r border-purple-500/50"
                    style={{
                      left: `${(startTime / duration) * 100}%`,
                      right: `${100 - (endTime / duration) * 100}%`
                    }}
                  />
                  {/* Current playhead indicator */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-pink-500 shadow-md shadow-pink-500/50 z-10 pointer-events-none"
                    style={{
                      left: `${(currentTime / duration) * 100}%`
                    }}
                  />

                  {/* Range Sliders Container */}
                  <div className="w-full relative h-2">
                    {/* Start Slider */}
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.01}
                      value={startTime}
                      onChange={(e) => handleTimelineChange(e, 'start')}
                      className="absolute w-full top-0 bottom-0 appearance-none bg-transparent pointer-events-none z-20 cursor-pointer [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:shadow-lg"
                    />
                    {/* End Slider */}
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

        {/* Right 1 Column: Panel Options / Trimming Configurations */}
        <div className="flex flex-col gap-6">
          {/* File Metadata Panel */}
          {videoFile && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm space-y-4">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-400">File Information</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                  <span className="text-slate-500">Name</span>
                  <span className="text-slate-200 truncate max-w-[150px] font-mono text-xs" title={videoFile.name}>
                    {videoFile.name}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                  <span className="text-slate-500">Size</span>
                  <span className="text-slate-200 font-mono text-xs">
                    {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                  <span className="text-slate-500">Duration</span>
                  <span className="text-slate-200 font-mono text-xs">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Export panel */}
          {videoUrl && (
            <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-sm space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-400">Cut & Export Settings</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    Trimming exports the selection between your start and end points into a high-quality WebM video directly inside the browser memory.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-950 p-4 border border-slate-900 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                        <Clock className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Output Duration</p>
                        <p className="text-sm font-semibold text-white font-mono">{formatTime(endTime - startTime)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-6">
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
                        <h4 className="text-xs font-semibold text-green-400">Video successfully trimmed!</h4>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Your cut video is ready for download.
                        </p>
                      </div>
                    </div>

                    <a
                      href={exportedUrl}
                      download={`opencut_trimmed_${Date.now()}.webm`}
                      className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-green-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-600/15 hover:bg-green-500 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download Video
                    </a>

                    <button
                      onClick={() => setExportedUrl('')}
                      className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-2.5 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Clear Selection
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
                      Trim and Save Selection
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
                <Info className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">How to use OpenCut:</h4>
                  <ul className="mt-3 space-y-2.5 text-[11px] text-slate-400 list-decimal pl-4">
                    <li>Load any local video file (your video stays 100% private and never uploads to servers).</li>
                    <li>Drag the purple and pink handles on the timeline to select your starting and ending points.</li>
                    <li>Use the media controller to play and preview your trimmed clip.</li>
                    <li>Click <strong>Trim and Save Selection</strong> to record and download your cut file instantly.</li>
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
